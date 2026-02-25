import { aiReceiptParseResponseSchema } from '@mintly/shared';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountModel } from '../src/models/Account.js';
import { BudgetModel } from '../src/models/Budget.js';
import { CategoryModel } from '../src/models/Category.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { RecurringRuleModel } from '../src/models/RecurringRule.js';
import { TransactionModel } from '../src/models/Transaction.js';
import { UserModel } from '../src/models/User.js';
import { clearReceiptAiAssistCacheForTests } from '../src/lib/receipt-ai-assist.js';
import { resetConfigForTests } from '../src/config.js';
import { buildServer } from '../src/server.js';

describe('POST /ai/receipt-parse', () => {
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
    resetConfigForTests();

    app = buildServer({ logger: false });
    await app.ready();
  }, 120000);

  beforeEach(async () => {
    clearReceiptAiAssistCacheForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    await Promise.all([
      TransactionModel.deleteMany({}),
      BudgetModel.deleteMany({}),
      RecurringRuleModel.deleteMany({}),
      CategoryModel.deleteMany({}),
      AccountModel.deleteMany({}),
      RefreshTokenModel.deleteMany({}),
      UserModel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    await app.close();

    if (mongo) {
      await mongo.stop();
    }
  }, 60000);

  async function registerUser(email: string, name = 'AI Receipt User') {
    const response = await request(app.server).post('/auth/register').send({
      email,
      password: 'Password123',
      name,
    });

    expect(response.status).toBe(201);
    return response.body as {
      accessToken: string;
      user: { id: string; email: string };
    };
  }

  it('returns parsed receipt data, keeps prompt privacy-safe, and caches repeated requests', async () => {
    const session = await registerUser('receipt-parse@example.com');

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ content?: string }>;
      };
      const userPrompt = body.messages?.[1]?.content ?? '';

      expect(userPrompt).not.toContain(session.user.id);
      expect(userPrompt).not.toContain(session.user.email);
      expect(userPrompt).not.toContain('customer@mail.com');
      expect(userPrompt).toContain('[redacted-email]');

      return new Response(
        JSON.stringify({
          success: true,
          result: {
            response: JSON.stringify({
              merchant: 'Migros',
              date: '2026-01-12',
              amount: 245.7,
              currency: 'TRY',
              categorySuggestion: 'grocery',
              confidence: 0.91,
            }),
          },
          errors: [],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const payload = {
      rawText: 'Migros\nTOPLAM 245,70 TL\nTarih 12.01.2026\nEmail customer@mail.com',
      locale: 'tr',
      currencyHint: 'TRY',
    };

    const firstResponse = await request(app.server)
      .post('/ai/receipt-parse')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(payload);

    expect(firstResponse.status).toBe(200);
    const firstParsed = aiReceiptParseResponseSchema.safeParse(firstResponse.body);
    expect(firstParsed.success).toBe(true);
    if (!firstParsed.success) {
      return;
    }

    expect(firstParsed.data.merchant).toBe('Migros');
    expect(firstParsed.data.amount).toBe(245.7);
    expect(firstParsed.data.currency).toBe('TRY');
    expect(firstParsed.data.cacheHit).toBe(false);

    const secondResponse = await request(app.server)
      .post('/ai/receipt-parse')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(payload);

    expect(secondResponse.status).toBe(200);
    const secondParsed = aiReceiptParseResponseSchema.safeParse(secondResponse.body);
    expect(secondParsed.success).toBe(true);
    if (!secondParsed.success) {
      return;
    }

    expect(secondParsed.data.cacheHit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to heuristic parse when provider fails', async () => {
    const session = await registerUser('receipt-fallback@example.com');

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 10001, message: 'provider unavailable' }],
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const response = await request(app.server)
      .post('/ai/receipt-parse')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        rawText: 'Shell\nTOPLAM 1.245,25 TL\nTarih 2026-02-11',
        locale: 'tr',
        currencyHint: 'TRY',
      });

    expect(response.status).toBe(200);
    const parsed = aiReceiptParseResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data.source).toBe('heuristic');
    expect(parsed.data.amount).toBe(1245.25);
    expect(parsed.data.currency).toBe('TRY');
    expect(parsed.data.confidence).toBeGreaterThan(0);
  });
});
