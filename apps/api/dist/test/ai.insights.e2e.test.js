import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountModel } from '../src/models/Account.js';
import { BudgetModel } from '../src/models/Budget.js';
import { CategoryModel } from '../src/models/Category.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { RecurringRuleModel } from '../src/models/RecurringRule.js';
import { TransactionModel } from '../src/models/Transaction.js';
import { UserModel } from '../src/models/User.js';
import { buildServer } from '../src/server.js';
import { clearAiInsightsCacheForTests } from '../src/lib/ai-insights.js';
describe('GET /ai/insights', () => {
    let mongo;
    let app;
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
        process.env.GEMINI_API_KEY = 'test-gemini-api-key';
        process.env.GEMINI_MODEL = 'gemini-1.5-flash';
        app = buildServer({ logger: false });
        await app.ready();
    }, 120000);
    beforeEach(async () => {
        clearAiInsightsCacheForTests();
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
    async function registerUser(email, name = 'AI User') {
        const response = await request(app.server).post('/auth/register').send({
            email,
            password: 'Password123',
            name,
        });
        expect(response.status).toBe(201);
        return response.body;
    }
    async function seedFinanceForInsights(userId) {
        await UserModel.updateOne({ _id: userId }, { $set: { baseCurrency: 'TRY' } });
        const account = await AccountModel.create({
            userId,
            name: 'Main Bank',
            type: 'bank',
            currency: 'TRY',
        });
        const salaryCategory = await CategoryModel.create({
            userId,
            name: 'Salary',
            key: 'salary',
            type: 'income',
            color: '#22C55E',
            icon: 'cash',
            isSystem: false,
        });
        const foodCategory = await CategoryModel.create({
            userId,
            name: 'Food',
            key: 'food',
            type: 'expense',
            color: '#EF4444',
            icon: 'restaurant',
            isSystem: false,
        });
        await TransactionModel.create([
            {
                userId,
                accountId: account._id,
                categoryId: salaryCategory._id,
                type: 'income',
                kind: 'normal',
                amount: 52000,
                currency: 'TRY',
                description: 'Monthly salary',
                occurredAt: new Date('2026-01-03T10:00:00.000Z'),
            },
            {
                userId,
                accountId: account._id,
                categoryId: foodCategory._id,
                type: 'expense',
                kind: 'normal',
                amount: 1800,
                currency: 'TRY',
                description: 'Market shopping',
                occurredAt: new Date('2026-01-05T12:00:00.000Z'),
            },
            {
                userId,
                accountId: account._id,
                categoryId: foodCategory._id,
                type: 'expense',
                kind: 'normal',
                amount: 950,
                currency: 'TRY',
                description: 'Cafe',
                occurredAt: new Date('2026-01-11T18:00:00.000Z'),
            },
        ]);
        await BudgetModel.create({
            userId,
            categoryId: foodCategory._id,
            month: '2026-01',
            limitAmount: 3000,
        });
        await RecurringRuleModel.create({
            userId,
            kind: 'normal',
            accountId: account._id,
            categoryId: foodCategory._id,
            type: 'expense',
            amount: 450,
            cadence: 'weekly',
            dayOfWeek: 1,
            startAt: new Date('2026-01-01T00:00:00.000Z'),
            nextRunAt: new Date('2026-01-08T00:00:00.000Z'),
            isPaused: false,
        });
    }
    it('returns structured AI insights and keeps prompt free of direct user identifiers', async () => {
        const session = await registerUser('insights-user@example.com');
        const userId = new Types.ObjectId(session.user.id);
        await seedFinanceForInsights(userId);
        const fetchMock = vi.fn(async (_url, init) => {
            const body = JSON.parse(String(init?.body ?? '{}'));
            const promptText = body.contents?.[0]?.parts?.[0]?.text ?? '';
            expect(promptText).not.toContain(session.user.email);
            expect(promptText).not.toContain(session.user.id);
            return new Response(JSON.stringify({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        summary: 'Geliriniz giderlerinizi güvenli bir marjla aşıyor.',
                                        topFindings: [
                                            'Gıda harcamaları bu aralıktaki en yüksek gider kategorisi.',
                                            'Bütçe limiti aşılmamış ve harcama oranı yönetilebilir seviyede.',
                                            'Tekrarlayan haftalık gider kuralı aktif durumda.',
                                        ],
                                        suggestedActions: [
                                            'Gıda bütçesini izlemeye devam edin ve haftalık limit belirleyin.',
                                            'Artan nakit akışını kısa vadeli birikime yönlendirin.',
                                            'Haftalık tekrar eden giderleri ay sonunda gözden geçirin.',
                                        ],
                                        warnings: [],
                                    }),
                                },
                            ],
                        },
                    },
                ],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchMock);
        const response = await request(app.server)
            .get('/ai/insights')
            .query({ from: '2026-01-01', to: '2026-01-31', language: 'tr' })
            .set('Authorization', `Bearer ${session.accessToken}`);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            from: '2026-01-01',
            to: '2026-01-31',
            language: 'tr',
            currency: 'TRY',
        });
        expect(response.body.summary).toBeTypeOf('string');
        expect(response.body.topFindings.length).toBeGreaterThan(0);
        expect(response.body.suggestedActions.length).toBeGreaterThan(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('retries once on 429 from Gemini and succeeds', async () => {
        const session = await registerUser('insights-retry@example.com');
        const userId = new Types.ObjectId(session.user.id);
        await seedFinanceForInsights(userId);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
        }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: JSON.stringify({
                                    summary: 'Stable period.',
                                    topFindings: ['Expenses remain controlled.'],
                                    suggestedActions: ['Continue weekly reviews.'],
                                    warnings: [],
                                }),
                            },
                        ],
                    },
                },
            ],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        const response = await request(app.server)
            .get('/ai/insights')
            .query({ from: '2026-01-01', to: '2026-01-31', language: 'en' })
            .set('Authorization', `Bearer ${session.accessToken}`);
        expect(response.status).toBe(200);
        expect(response.body.language).toBe('en');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
