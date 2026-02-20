import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountModel } from '../src/models/Account.js';
import { CategoryModel } from '../src/models/Category.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { TransactionModel } from '../src/models/Transaction.js';
import { UserModel } from '../src/models/User.js';
import { resetConfigForTests } from '../src/config.js';
import { buildServer } from '../src/server.js';
describe('/me/preferences', () => {
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
        resetConfigForTests();
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
    async function registerUser(email, name = 'Preference User') {
        const response = await request(app.server).post('/auth/register').send({
            email,
            password: 'Password123',
            name,
        });
        expect(response.status).toBe(201);
        return response.body;
    }
    it('returns default preferences and allows updates', async () => {
        const session = await registerUser('preferences@example.com');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const getDefault = await request(app.server).get('/me/preferences').set(authHeader);
        expect(getDefault.status).toBe(200);
        expect(getDefault.body).toEqual({
            preferences: {
                savingsTargetRate: 20,
                riskProfile: 'medium',
            },
        });
        const patch = await request(app.server).patch('/me/preferences').set(authHeader).send({
            savingsTargetRate: 32,
            riskProfile: 'high',
        });
        expect(patch.status).toBe(200);
        expect(patch.body).toEqual({
            preferences: {
                savingsTargetRate: 32,
                riskProfile: 'high',
            },
        });
        const getUpdated = await request(app.server).get('/me').set(authHeader);
        expect(getUpdated.status).toBe(200);
        expect(getUpdated.body.user.savingsTargetRate).toBe(32);
        expect(getUpdated.body.user.riskProfile).toBe('high');
    });
    it('validates input and requires auth', async () => {
        const unauthorized = await request(app.server).patch('/me/preferences').send({
            riskProfile: 'low',
        });
        expect(unauthorized.status).toBe(401);
        expect(unauthorized.body.error.code).toBe('UNAUTHORIZED');
        const session = await registerUser('preferences-2@example.com');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const invalidBody = await request(app.server)
            .patch('/me/preferences')
            .set(authHeader)
            .send({ savingsTargetRate: 120 });
        expect(invalidBody.status).toBe(400);
        expect(invalidBody.body.error.code).toBe('VALIDATION_ERROR');
    });
});
