import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/errors.js';

const verifyOauthIdTokenMock = vi.hoisted(() => vi.fn());
const exchangeGoogleOauthCodeForIdTokenMock = vi.hoisted(() => vi.fn());

vi.mock('../src/auth/oauth.js', () => ({
  exchangeGoogleOauthCodeForIdToken: exchangeGoogleOauthCodeForIdTokenMock,
  verifyOauthIdToken: verifyOauthIdTokenMock,
}));

import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { UserModel } from '../src/models/User.js';
import { buildServer } from '../src/server.js';

describe('POST /auth/oauth', () => {
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
    verifyOauthIdTokenMock.mockReset();
    exchangeGoogleOauthCodeForIdTokenMock.mockReset();
    await Promise.all([RefreshTokenModel.deleteMany({}), UserModel.deleteMany({})]);
  });

  afterAll(async () => {
    await app.close();

    if (mongo) {
      await mongo.stop();
    }
  }, 60000);

  async function registerUser(email: string, name = 'Local User') {
    const response = await request(app.server).post('/auth/register').send({
      email,
      password: 'Password123',
      name,
    });

    expect(response.status).toBe(201);
    return response.body as {
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string; name: string | null };
    };
  }

  it('links oauth provider to existing email account', async () => {
    const existing = await registerUser('linked@example.com', 'Linked Account');

    verifyOauthIdTokenMock.mockResolvedValueOnce({
      provider: 'google',
      uid: 'google-uid-1',
      email: 'linked@example.com',
      name: 'Linked Account',
      emailVerified: true,
    });

    const response = await request(app.server).post('/auth/oauth').send({
      provider: 'google',
      idToken: 'google-id-token',
    });

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(existing.user.id);
    expect(response.body.user.email).toBe('linked@example.com');

    const user = await UserModel.findById(existing.user.id);
    expect(user).not.toBeNull();
    const providers = (user?.providers ?? []).map((item: { provider: string; uid: string }) => ({
      provider: item.provider,
      uid: item.uid,
    }));
    expect(providers).toEqual([{ provider: 'google', uid: 'google-uid-1' }]);
  });

  it('creates new user for first oauth login and issues session', async () => {
    verifyOauthIdTokenMock.mockResolvedValueOnce({
      provider: 'google',
      uid: 'google-uid-2',
      email: 'new-oauth@example.com',
      name: 'New OAuth User',
      emailVerified: true,
    });

    const response = await request(app.server).post('/auth/oauth').send({
      provider: 'google',
      idToken: 'google-id-token',
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('new-oauth@example.com');
    expect(response.body.accessToken).toBeTypeOf('string');
    expect(response.body.refreshToken).toBeTypeOf('string');

    const created = await UserModel.findOne({ email: 'new-oauth@example.com' });
    expect(created).not.toBeNull();
    const providers = (created?.providers ?? []).map((item: { provider: string; uid: string }) => ({
      provider: item.provider,
      uid: item.uid,
    }));
    expect(providers).toEqual([{ provider: 'google', uid: 'google-uid-2' }]);
    expect(created?.passwordHash).toBeTypeOf('string');
    expect(created?.passwordHash.length).toBeGreaterThan(0);
  });

  it('exchanges google authorization code before verifying identity', async () => {
    exchangeGoogleOauthCodeForIdTokenMock.mockResolvedValueOnce('google-id-token-from-code');
    verifyOauthIdTokenMock.mockResolvedValueOnce({
      provider: 'google',
      uid: 'google-uid-3',
      email: 'code-oauth@example.com',
      name: 'Code OAuth User',
      emailVerified: true,
    });

    const response = await request(app.server).post('/auth/oauth').send({
      provider: 'google',
      authorizationCode: 'google-auth-code',
      codeVerifier: 'pkce-code-verifier',
      redirectUri: 'com.googleusercontent.apps.example:/oauthredirect',
      clientId: 'ios-client-id.apps.googleusercontent.com',
    });

    expect(response.status).toBe(200);
    expect(exchangeGoogleOauthCodeForIdTokenMock).toHaveBeenCalledWith({
      code: 'google-auth-code',
      codeVerifier: 'pkce-code-verifier',
      redirectUri: 'com.googleusercontent.apps.example:/oauthredirect',
      clientId: 'ios-client-id.apps.googleusercontent.com',
    });
    expect(verifyOauthIdTokenMock).toHaveBeenCalledWith({
      provider: 'google',
      idToken: 'google-id-token-from-code',
      nonce: undefined,
    });
    expect(response.body.user.email).toBe('code-oauth@example.com');
  });

  it('returns OAUTH_EMAIL_REQUIRED when first oauth login has no email', async () => {
    verifyOauthIdTokenMock.mockResolvedValueOnce({
      provider: 'apple',
      uid: 'apple-uid-1',
      email: null,
      name: null,
      emailVerified: false,
    });

    const response = await request(app.server).post('/auth/oauth').send({
      provider: 'apple',
      idToken: 'apple-id-token',
      nonce: 'raw-nonce-value',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'OAUTH_EMAIL_REQUIRED',
        message: 'OAuth account email is required for first sign-in',
      },
    });
  });

  it('logs in linked oauth account even when token has no email', async () => {
    verifyOauthIdTokenMock.mockResolvedValueOnce({
      provider: 'apple',
      uid: 'apple-uid-linked',
      email: 'apple-linked@example.com',
      name: 'Apple Linked',
      emailVerified: true,
    });

    const firstLogin = await request(app.server).post('/auth/oauth').send({
      provider: 'apple',
      idToken: 'apple-id-token-first',
      nonce: 'first-nonce-1234',
    });

    expect(firstLogin.status).toBe(200);

    verifyOauthIdTokenMock.mockResolvedValueOnce({
      provider: 'apple',
      uid: 'apple-uid-linked',
      email: null,
      name: null,
      emailVerified: false,
    });

    const secondLogin = await request(app.server).post('/auth/oauth').send({
      provider: 'apple',
      idToken: 'apple-id-token-second',
      nonce: 'second-nonce-5678',
    });

    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.user.email).toBe('apple-linked@example.com');
  });

  it('returns oauth verification errors from verifier', async () => {
    verifyOauthIdTokenMock.mockRejectedValueOnce(
      new ApiError({
        code: 'OAUTH_TOKEN_INVALID',
        message: 'OAuth token is invalid or expired',
        statusCode: 401,
      }),
    );

    const response = await request(app.server).post('/auth/oauth').send({
      provider: 'google',
      idToken: 'bad-id-token',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: 'OAUTH_TOKEN_INVALID',
        message: 'OAuth token is invalid or expired',
      },
    });
  });
});
