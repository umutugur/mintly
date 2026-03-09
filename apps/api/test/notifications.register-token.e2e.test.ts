import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { UserModel } from '../src/models/User.js';
import { buildServer } from '../src/server.js';

type UserTokensDoc = {
  expoPushTokens?: Array<{
    token?: string | null;
  }>;
} | null;

describe('POST /notifications/register-token', () => {
  let mongo: MongoMemoryServer;
  let app!: ReturnType<typeof buildServer>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();

    process.env.MONGODB_URI = mongo.getUri();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.ACCESS_TTL_MIN = '15';
    process.env.REFRESH_TTL_DAYS = '30';
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = 'http://localhost:8089';
    process.env.ADVISOR_PROVIDER = 'cloudflare';
    process.env.ADVISOR_CLOUDFLARE_API_TOKEN = 'test-cloudflare-token';
    process.env.ADVISOR_CLOUDFLARE_ACCOUNT_ID = 'test-cloudflare-account';
    process.env.ADVISOR_CLOUDFLARE_MODEL = '@cf/zai-org/glm-4.7-flash';

    app = buildServer({ logger: false });
    await app.ready();
  }, 120000);

  beforeEach(async () => {
    await Promise.all([RefreshTokenModel.deleteMany({}), UserModel.deleteMany({})]);
  });

  afterAll(async () => {
    await app.close();

    if (mongo) {
      await mongo.stop();
    }
  }, 60000);

  async function registerUser(email: string, name = 'Push User') {
    const response = await request(app.server).post('/auth/register').send({
      email,
      password: 'Password123',
      name,
    });

    expect(response.status).toBe(201);
    return response.body as {
      accessToken: string;
      user: { id: string };
    };
  }

  it('keeps exactly one active token for the same user', async () => {
    const session = await registerUser('single-token@example.com');
    const authHeader = { Authorization: `Bearer ${session.accessToken}` };
    const now = new Date();

    await UserModel.findByIdAndUpdate(session.user.id, {
      $set: {
        expoPushTokens: [
          {
            token: 'ExpoPushToken[old-token-a]',
            platform: 'ios',
            device: 'Old iPhone',
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
          },
          {
            token: 'ExpoPushToken[old-token-b]',
            platform: 'android',
            device: 'Old Android',
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
          },
        ],
      },
    });

    const registerResponse = await request(app.server)
      .post('/notifications/register-token')
      .set(authHeader)
      .send({
        userId: session.user.id,
        expoPushToken: 'ExpoPushToken[current-token]',
        platform: 'ios',
        device: 'iPhone 15',
        deviceInfo: {
          appOwnership: 'expo',
        },
      });

    expect(registerResponse.status).toBe(200);
    expect(registerResponse.body.ok).toBe(true);
    expect(registerResponse.body.tokensCount).toBe(1);

    const user = await UserModel.findById(session.user.id)
      .select('expoPushTokens')
      .lean<UserTokensDoc>();
    const userTokens = user?.expoPushTokens ?? [];
    expect(userTokens).toHaveLength(1);
    expect(userTokens[0]?.token).toBe('ExpoPushToken[current-token]');
  });

  it('removes same token from another user and reassigns it safely', async () => {
    const ownerA = await registerUser('owner-a@example.com');
    const ownerB = await registerUser('owner-b@example.com');
    const now = new Date();

    await UserModel.findByIdAndUpdate(ownerB.user.id, {
      $set: {
        expoPushTokens: [
          {
            token: 'ExpoPushToken[shared-token]',
            platform: 'android',
            device: 'Android',
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
          },
        ],
      },
    });

    const firstRegister = await request(app.server)
      .post('/notifications/register-token')
      .set({ Authorization: `Bearer ${ownerA.accessToken}` })
      .send({
        userId: ownerA.user.id,
        expoPushToken: 'ExpoPushToken[shared-token]',
        platform: 'ios',
        device: 'iPhone',
        deviceInfo: {},
      });

    expect(firstRegister.status).toBe(200);
    expect(firstRegister.body.tokensCount).toBe(1);
    expect(firstRegister.body.reusedExisting).toBe(false);

    const secondRegister = await request(app.server)
      .post('/notifications/register-token')
      .set({ Authorization: `Bearer ${ownerA.accessToken}` })
      .send({
        userId: ownerA.user.id,
        expoPushToken: 'ExpoPushToken[shared-token]',
        platform: 'ios',
        device: 'iPhone',
        deviceInfo: {},
      });

    expect(secondRegister.status).toBe(200);
    expect(secondRegister.body.tokensCount).toBe(1);
    expect(secondRegister.body.reusedExisting).toBe(true);

    const [userA, userB] = await Promise.all([
      UserModel.findById(ownerA.user.id).select('expoPushTokens').lean<UserTokensDoc>(),
      UserModel.findById(ownerB.user.id).select('expoPushTokens').lean<UserTokensDoc>(),
    ]);

    const userATokens = userA?.expoPushTokens ?? [];
    const userBTokens = userB?.expoPushTokens ?? [];

    expect(userATokens).toHaveLength(1);
    expect(userATokens[0]?.token).toBe('ExpoPushToken[shared-token]');
    expect(userBTokens).toHaveLength(0);
  });
});
