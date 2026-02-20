import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccountModel } from '../src/models/Account.js';
import { CategoryModel } from '../src/models/Category.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { TransactionModel } from '../src/models/Transaction.js';
import { UserModel } from '../src/models/User.js';
import { buildServer } from '../src/server.js';

describe('Transfer delete endpoint', () => {
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

  async function registerUser(email: string, name = 'Transfer User') {
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

  it('deletes both sides of a transfer by group id', async () => {
    const session = await registerUser('transfer-delete@example.com', 'Transfer Delete');
    const authHeader = { Authorization: `Bearer ${session.accessToken}` };

    const [fromAccount, toAccount] = await Promise.all([
      request(app.server).post('/accounts').set(authHeader).send({
        name: 'Bank',
        type: 'bank',
        currency: 'USD',
      }),
      request(app.server).post('/accounts').set(authHeader).send({
        name: 'Savings',
        type: 'cash',
        currency: 'USD',
      }),
    ]);

    expect(fromAccount.status).toBe(201);
    expect(toAccount.status).toBe(201);

    const transfer = await request(app.server).post('/transfers').set(authHeader).send({
      fromAccountId: fromAccount.body.id,
      toAccountId: toAccount.body.id,
      amount: 200,
      occurredAt: '2026-09-08T12:00:00.000Z',
      description: 'Move to savings',
    });
    expect(transfer.status).toBe(201);

    const deleteTransfer = await request(app.server)
      .delete(`/transfers/${transfer.body.groupId as string}`)
      .set(authHeader);

    expect(deleteTransfer.status).toBe(200);
    expect(deleteTransfer.body.ok).toBe(true);

    const activeTransfers = await request(app.server)
      .get('/transactions')
      .set(authHeader)
      .query({ kind: 'transfer', limit: 50, page: 1 });
    expect(activeTransfers.status).toBe(200);
    expect(activeTransfers.body.transactions).toHaveLength(0);

    const deletedTransfers = await request(app.server)
      .get('/transactions')
      .set(authHeader)
      .query({ kind: 'transfer', includeDeleted: true, limit: 50, page: 1 });
    expect(deletedTransfers.status).toBe(200);
    expect(deletedTransfers.body.transactions).toHaveLength(2);
    expect(
      deletedTransfers.body.transactions.every(
        (transaction: { transferGroupId: string | null }) =>
          transaction.transferGroupId === transfer.body.groupId,
      ),
    ).toBe(true);
  });

  it('enforces object-level authorization on transfer delete', async () => {
    const owner = await registerUser('transfer-owner-delete@example.com', 'Owner');
    const ownerHeader = { Authorization: `Bearer ${owner.accessToken}` };
    const attacker = await registerUser('transfer-attacker-delete@example.com', 'Attacker');
    const attackerHeader = { Authorization: `Bearer ${attacker.accessToken}` };

    const [fromAccount, toAccount] = await Promise.all([
      request(app.server).post('/accounts').set(ownerHeader).send({
        name: 'Owner Bank',
        type: 'bank',
        currency: 'USD',
      }),
      request(app.server).post('/accounts').set(ownerHeader).send({
        name: 'Owner Cash',
        type: 'cash',
        currency: 'USD',
      }),
    ]);

    expect(fromAccount.status).toBe(201);
    expect(toAccount.status).toBe(201);

    const transfer = await request(app.server).post('/transfers').set(ownerHeader).send({
      fromAccountId: fromAccount.body.id,
      toAccountId: toAccount.body.id,
      amount: 25,
      occurredAt: '2026-09-08T12:00:00.000Z',
      description: 'Owner transfer',
    });
    expect(transfer.status).toBe(201);

    const forbiddenDelete = await request(app.server)
      .delete(`/transfers/${transfer.body.groupId as string}`)
      .set(attackerHeader);

    expect(forbiddenDelete.status).toBe(404);
    expect(forbiddenDelete.body.error.code).toBe('TRANSFER_NOT_FOUND');
  });
});
