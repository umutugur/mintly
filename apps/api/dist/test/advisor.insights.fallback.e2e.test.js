import { advisorInsightSchema } from '@finsight/shared';
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
describe('GET /advisor/insights (fallback mode)', () => {
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
        delete process.env.GEMINI_API_KEY;
        delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        resetConfigForTests();
        app = buildServer({ logger: false });
        await app.ready();
    }, 120000);
    beforeEach(async () => {
        clearAdvisorInsightsCacheForTests();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            success: false,
            errors: [{ code: 10001, message: 'provider unavailable' }],
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })));
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
    async function registerUser(email, name = 'Advisor Fallback User') {
        const response = await request(app.server).post('/auth/register').send({
            email,
            password: 'Password123',
            name,
        });
        expect(response.status).toBe(201);
        return response.body;
    }
    async function seedAdvisorData(userId) {
        const userObjectId = new Types.ObjectId(userId);
        await UserModel.updateOne({ _id: userObjectId }, { $set: { baseCurrency: 'TRY', savingsTargetRate: 25, riskProfile: 'low' } });
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
                amount: 56000,
                currency: 'TRY',
                description: 'Maas',
                occurredAt: new Date('2026-01-04T10:00:00.000Z'),
            },
            {
                userId: userObjectId,
                accountId: account._id,
                categoryId: marketCategory._id,
                type: 'expense',
                kind: 'normal',
                amount: 4200,
                currency: 'TRY',
                description: 'Market',
                occurredAt: new Date('2026-01-11T10:00:00.000Z'),
            },
        ]);
    }
    it('returns schema-valid fallback mode quickly when provider returns 5xx', async () => {
        const session = await registerUser('advisor-fallback@example.com');
        await seedAdvisorData(session.user.id);
        const startedAt = Date.now();
        const response = await request(app.server)
            .get('/advisor/insights')
            .query({ month: '2026-01', language: 'tr' })
            .set('Authorization', `Bearer ${session.accessToken}`);
        const durationMs = Date.now() - startedAt;
        expect(response.status).toBe(200);
        expect(durationMs).toBeLessThanOrEqual(2000);
        const parsed = advisorInsightSchema.safeParse(response.body);
        expect(parsed.success).toBe(true);
        if (!parsed.success) {
            return;
        }
        expect(parsed.data.mode).toBe('fallback');
        expect(parsed.data.modeReason).toBe('provider_http_error');
        expect(parsed.data.provider).toBe('cloudflare');
        expect(parsed.data.providerStatus).toBe(500);
        expect(parsed.data.preferences.savingsTargetRate).toBe(25);
        expect(parsed.data.preferences.riskProfile).toBe('low');
        expect(parsed.data.advice.summary.length).toBeGreaterThan(0);
    });
});
