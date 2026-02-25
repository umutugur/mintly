import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccountModel } from '../src/models/Account.js';
import { CategoryModel } from '../src/models/Category.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { TransactionModel } from '../src/models/Transaction.js';
import { UserModel } from '../src/models/User.js';
import { buildServer } from '../src/server.js';

describe('PATCH /me', () => {
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
    await Promise.all([
      TransactionModel.deleteMany({}),
      CategoryModel.deleteMany({}),
      AccountModel.deleteMany({}),
      RefreshTokenModel.deleteMany({}),
      UserModel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await app.close();

    if (mongo) {
      await mongo.stop();
    }
  }, 60000);

  async function registerUser(email: string, name = 'Profile User') {
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

  it('updates current user name and returns updated me payload', async () => {
    const session = await registerUser('me-patch@example.com', 'Old Name');
    const authHeader = { Authorization: `Bearer ${session.accessToken}` };

    const patchResponse = await request(app.server).patch('/me').set(authHeader).send({
      name: 'New Name',
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.user.name).toBe('New Name');

    const meResponse = await request(app.server).get('/me').set(authHeader);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.name).toBe('New Name');
  });

  it('requires auth and validates body', async () => {
    const unauthorized = await request(app.server).patch('/me').send({ name: 'Name' });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.error.code).toBe('UNAUTHORIZED');

    const session = await registerUser('me-patch-2@example.com', 'Valid Name');
    const authHeader = { Authorization: `Bearer ${session.accessToken}` };

    const invalidBody = await request(app.server).patch('/me').set(authHeader).send({});

    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('updates base currency and synchronizes account + transaction currency values', async () => {
    const session = await registerUser('currency-sync@example.com', 'Currency User');
    const authHeader = { Authorization: `Bearer ${session.accessToken}` };

    const account = await request(app.server).post('/accounts').set(authHeader).send({
      name: 'Main',
      type: 'bank',
      currency: 'USD',
    });
    expect(account.status).toBe(201);

    const category = await request(app.server).post('/categories').set(authHeader).send({
      name: 'Groceries',
      type: 'expense',
      color: '#12AA34',
      icon: 'cart',
    });
    expect(category.status).toBe(201);

    const transaction = await request(app.server).post('/transactions').set(authHeader).send({
      accountId: account.body.id,
      categoryId: category.body.id,
      type: 'expense',
      amount: 42,
      currency: 'USD',
      description: 'Market',
      occurredAt: new Date().toISOString(),
    });
    expect(transaction.status).toBe(201);

    const patchResponse = await request(app.server).patch('/me').set(authHeader).send({
      baseCurrency: 'EUR',
    });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.user.baseCurrency).toBe('EUR');

    const accountsResponse = await request(app.server).get('/accounts').set(authHeader);
    expect(accountsResponse.status).toBe(200);
    expect(accountsResponse.body.accounts[0].currency).toBe('EUR');

    const transactionsResponse = await request(app.server).get('/transactions').set(authHeader);
    expect(transactionsResponse.status).toBe(200);
    expect(transactionsResponse.body.transactions[0].currency).toBe('EUR');
  });
});
