import { advisorInsightSchema } from '@mintly/shared';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountModel } from '../src/models/Account.js';
import { BudgetModel } from '../src/models/Budget.js';
import { CategoryModel } from '../src/models/Category.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { RecurringRuleModel } from '../src/models/RecurringRule.js';
import { TransactionModel } from '../src/models/Transaction.js';
import { UserModel } from '../src/models/User.js';
import { clearAdvisorInsightsCacheForTests } from '../src/lib/advisor-insights.js';
import { resetConfigForTests } from '../src/config.js';
import { buildServer } from '../src/server.js';

describe('GET /advisor/insights', () => {
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
    clearAdvisorInsightsCacheForTests();
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

  async function registerUser(email: string, name = 'Advisor User') {
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

  async function seedAdvisorData(userId: string): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);

    await UserModel.updateOne({ _id: userObjectId }, { $set: { baseCurrency: 'TRY' } });

    const account = await AccountModel.create({
      userId: userObjectId,
      name: 'Main Bank',
      type: 'bank',
      currency: 'TRY',
    });

    const salaryCategory = await CategoryModel.create({
      userId: userObjectId,
      name: 'Salary',
      key: 'salary',
      type: 'income',
      color: '#16A34A',
      icon: 'cash-outline',
      isSystem: false,
    });

    const marketCategory = await CategoryModel.create({
      userId: userObjectId,
      name: 'Market',
      key: 'market',
      type: 'expense',
      color: '#EF4444',
      icon: 'cart-outline',
      isSystem: false,
    });

    await TransactionModel.create([
      {
        userId: userObjectId,
        accountId: account._id,
        categoryId: salaryCategory._id,
        type: 'income',
        kind: 'normal',
        amount: 52000,
        currency: 'TRY',
        description: 'Aylik maas',
        occurredAt: new Date('2025-11-03T10:00:00.000Z'),
      },
      {
        userId: userObjectId,
        accountId: account._id,
        categoryId: marketCategory._id,
        type: 'expense',
        kind: 'normal',
        amount: 2800,
        currency: 'TRY',
        description: 'Haftalik market',
        occurredAt: new Date('2025-11-08T11:00:00.000Z'),
      },
      {
        userId: userObjectId,
        accountId: account._id,
        categoryId: salaryCategory._id,
        type: 'income',
        kind: 'normal',
        amount: 51000,
        currency: 'TRY',
        description: 'Maaş',
        occurredAt: new Date('2025-12-03T10:00:00.000Z'),
      },
      {
        userId: userObjectId,
        accountId: account._id,
        categoryId: marketCategory._id,
        type: 'expense',
        kind: 'normal',
        amount: 3100,
        currency: 'TRY',
        description: 'Market alisverisi',
        occurredAt: new Date('2025-12-12T12:00:00.000Z'),
      },
      {
        userId: userObjectId,
        accountId: account._id,
        categoryId: salaryCategory._id,
        type: 'income',
        kind: 'normal',
        amount: 54000,
        currency: 'TRY',
        description: 'Maaş',
        occurredAt: new Date('2026-01-03T10:00:00.000Z'),
      },
      {
        userId: userObjectId,
        accountId: account._id,
        categoryId: marketCategory._id,
        type: 'expense',
        kind: 'normal',
        amount: 3400,
        currency: 'TRY',
        description: 'Market',
        occurredAt: new Date('2026-01-15T12:00:00.000Z'),
      },
      {
        userId: userObjectId,
        accountId: account._id,
        categoryId: marketCategory._id,
        type: 'expense',
        kind: 'normal',
        amount: 900,
        currency: 'TRY',
        description: 'Market',
        occurredAt: new Date('2026-01-22T12:00:00.000Z'),
      },
    ]);

    await BudgetModel.create({
      userId: userObjectId,
      categoryId: marketCategory._id,
      month: '2026-01',
      limitAmount: 5000,
    });

    await RecurringRuleModel.create({
      userId: userObjectId,
      kind: 'normal',
      accountId: account._id,
      categoryId: marketCategory._id,
      type: 'expense',
      amount: 750,
      cadence: 'weekly',
      dayOfWeek: 2,
      startAt: new Date('2025-11-01T00:00:00.000Z'),
      nextRunAt: new Date('2026-01-28T00:00:00.000Z'),
      isPaused: false,
    });
  }

  function createCloudflareProviderResponse(summary: string): Response {
    return new Response(
      JSON.stringify({
        success: true,
        result: {
          response: JSON.stringify({
            summary,
            topFindings: [
              'Gelir-gider dengesi pozitif seyrediyor.',
              'Market kategorisi gider değişimini sürüklüyor.',
              'Birikim hedefi korunabilir seviyede.',
            ],
            suggestedActions: [
              'Market kategorisi için haftalık limit belirleyin.',
              'Maaş günü sonrası otomatik birikim transferi planlayın.',
              'Bu hafta bir zorunlu olmayan harcamayı erteleyin.',
            ],
            warnings: [],
            savings: {
              targetRate: 0.22,
              monthlyTargetAmount: 9500,
              next7DaysActions: [
                'Market harcamalari icin haftalik limit belirleyin.',
                'Maas gununden sonra otomatik birikim transferi planlayin.',
                'Bu hafta zorunlu olmayan bir satin alimi erteleyin.',
              ],
              autoTransferSuggestion: 'Gelirden hemen sonra birikim hesabina otomatik transfer tanimlayin.',
            },
            investment: {
              profiles: [
                {
                  level: 'low',
                  title: 'Dusuk Risk',
                  rationale: 'Likiditeyi koruyarak dalgalanmayi azaltir.',
                  options: ['Vadeli hesap', 'Likid fonlar'],
                },
                {
                  level: 'medium',
                  title: 'Orta Risk',
                  rationale: 'Buyume ve risk arasinda denge kurar.',
                  options: ['Endeks agirlikli dagilim', 'Dengeli fon sepeti'],
                },
                {
                  level: 'high',
                  title: 'Yuksek Risk',
                  rationale: 'Uzun vade ve yuksek dalgalanma toleransi gerektirir.',
                  options: ['Yuksek hisse agirligi', 'Sektor limitleri'],
                },
              ],
              guidance: [
                'Acil durum fonu tamamlanmadan risk seviyesini artirmayin.',
                'Portfoyunuzu aylik duzenli araliklarla dengeleyin.',
              ],
            },
            expenseOptimization: {
              cutCandidates: [
                {
                  label: 'Market',
                  suggestedReductionPercent: 12,
                  alternativeAction: 'Haftalik toplu alisveris yapin ve kampanya listesi kullanin.',
                },
                {
                  label: 'Ulasim',
                  suggestedReductionPercent: 8,
                  alternativeAction: 'Kisa mesafelerde toplu tasima tercih edin.',
                },
                {
                  label: 'Abonelikler',
                  suggestedReductionPercent: 20,
                  alternativeAction: 'Aktif kullanilmayan abonelikleri dondurun.',
                },
              ],
              quickWins: [
                'Bu ay kullanmadiginiz bir aboneligi iptal edin.',
                'Haftalik market listesi ile plansiz harcamayi azaltin.',
              ],
            },
            tips: [
              'Haftalik kontrol ile asiri harcamayi erken yakalayin.',
              'Sabit giderleri ay sonunda yeniden degerlendirin.',
            ],
          }),
        },
        errors: [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  it('returns advisor insight payload for month query and supports regenerate', async () => {
    const session = await registerUser('advisor-user@example.com');
    await seedAdvisorData(session.user.id);

    const fetchMock = vi.fn(async () =>
      createCloudflareProviderResponse('Nakit akisiniz pozitif ve birikim kapasiteniz korunuyor.'),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const initialResponse = await request(app.server)
      .get('/advisor/insights')
      .query({ month: '2026-01', language: 'tr' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(initialResponse.status).toBe(200);
    const parsedInitial = advisorInsightSchema.safeParse(initialResponse.body);
    expect(parsedInitial.success).toBe(true);

    if (!parsedInitial.success) {
      return;
    }

    expect(parsedInitial.data.month).toBe('2026-01');
    expect(parsedInitial.data.language).toBe('tr');
    expect(parsedInitial.data.mode).toBe('ai');
    expect(parsedInitial.data.modeReason).toBeNull();
    expect(parsedInitial.data.provider).toBe('cloudflare');
    expect(parsedInitial.data.providerStatus).toBe(200);
    expect(parsedInitial.data.overview.currentMonthExpense).toBeGreaterThan(0);
    expect(parsedInitial.data.advice.summary.length).toBeGreaterThan(0);
    expect(parsedInitial.data.advice.topFindings.length).toBeGreaterThan(0);
    expect(parsedInitial.data.advice.suggestedActions.length).toBeGreaterThan(0);
    expect(parsedInitial.data.advice.savings.next7DaysActions.length).toBeGreaterThan(0);

    const regenerateResponse = await request(app.server)
      .get('/advisor/insights')
      .query({ month: '2026-01', language: 'tr', regenerate: 'true' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(regenerateResponse.status).toBe(200);
    const parsedRegenerate = advisorInsightSchema.safeParse(regenerateResponse.body);
    expect(parsedRegenerate.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('uses cache for non-regenerate requests and bypasses cache on regenerate', async () => {
    const session = await registerUser('advisor-cache@example.com');
    await seedAdvisorData(session.user.id);

    const fetchMock = vi.fn(async () =>
      createCloudflareProviderResponse('Cache test summary.'),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const firstResponse = await request(app.server)
      .get('/advisor/insights')
      .query({ month: '2026-01', language: 'tr' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(firstResponse.status).toBe(200);
    const firstParsed = advisorInsightSchema.safeParse(firstResponse.body);
    expect(firstParsed.success).toBe(true);
    if (!firstParsed.success) {
      return;
    }

    const secondResponse = await request(app.server)
      .get('/advisor/insights')
      .query({ month: '2026-01', language: 'tr' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(secondResponse.status).toBe(200);
    const secondParsed = advisorInsightSchema.safeParse(secondResponse.body);
    expect(secondParsed.success).toBe(true);
    if (!secondParsed.success) {
      return;
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondParsed.data.generatedAt).toBe(firstParsed.data.generatedAt);

    const regenerateResponse = await request(app.server)
      .get('/advisor/insights')
      .query({ month: '2026-01', language: 'tr', regenerate: 'true' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(regenerateResponse.status).toBe(200);
    const regenerateParsed = advisorInsightSchema.safeParse(regenerateResponse.body);
    expect(regenerateParsed.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back when provider returns 500 and regenerate is false', async () => {
    const session = await registerUser('advisor-provider-fallback@example.com');
    await seedAdvisorData(session.user.id);

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [
            {
              code: 5000,
              message: 'provider unavailable',
            },
          ],
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'cf-ray': 'test-ray-id',
          },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const response = await request(app.server)
      .get('/advisor/insights')
      .query({ month: '2026-01', language: 'tr' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(200);
    const parsed = advisorInsightSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data.mode).toBe('fallback');
    expect(parsed.data.modeReason).toBe('provider_http_error');
    expect(parsed.data.provider).toBe('cloudflare');
    expect(parsed.data.providerStatus).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns typed ADVISOR_PROVIDER_RATE_LIMIT when provider keeps returning 429', async () => {
    const session = await registerUser('advisor-rate-limited@example.com');
    await seedAdvisorData(session.user.id);

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [
            {
              code: 10049,
              message: 'quota exhausted',
            },
          ],
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '10',
            'cf-ray': 'test-rate-ray-id',
          },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const response = await request(app.server)
      .get('/advisor/insights')
      .query({ month: '2026-01', language: 'tr' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      error: {
        code: 'ADVISOR_PROVIDER_RATE_LIMIT',
      },
    });
    expect(response.body.error.details.retryAfterSec).toBe(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns typed ADVISOR_PROVIDER_INVALID_REQUEST when provider returns 400', async () => {
    const session = await registerUser('advisor-provider-invalid@example.com');
    await seedAdvisorData(session.user.id);

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [
            {
              code: 10001,
              message: 'invalid request schema',
            },
          ],
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'cf-ray': 'test-invalid-ray-id',
          },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const response = await request(app.server)
      .get('/advisor/insights')
      .query({ month: '2026-01', language: 'tr', regenerate: 'true' })
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: {
        code: 'ADVISOR_PROVIDER_INVALID_REQUEST',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
