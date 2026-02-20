import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountModel } from '../src/models/Account.js';
import { BudgetModel } from '../src/models/Budget.js';
import { CategoryModel } from '../src/models/Category.js';
import { GroupExpenseModel } from '../src/models/GroupExpense.js';
import { GroupModel } from '../src/models/Group.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { RecurringRuleModel } from '../src/models/RecurringRule.js';
import { RecurringRunLogModel } from '../src/models/RecurringRunLog.js';
import { TransactionModel } from '../src/models/Transaction.js';
import { UpcomingPaymentModel } from '../src/models/UpcomingPayment.js';
import { UserModel } from '../src/models/User.js';
import { resetConfigForTests } from '../src/config.js';
import { buildServer } from '../src/server.js';
describe('/upcoming-payments', () => {
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
            UpcomingPaymentModel.deleteMany({}),
            TransactionModel.deleteMany({}),
            BudgetModel.deleteMany({}),
            RecurringRunLogModel.deleteMany({}),
            RecurringRuleModel.deleteMany({}),
            GroupExpenseModel.deleteMany({}),
            GroupModel.deleteMany({}),
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
    async function registerUser(email, name = 'Upcoming User') {
        const response = await request(app.server).post('/auth/register').send({
            email,
            password: 'Password123',
            name,
        });
        expect(response.status).toBe(201);
        return response.body;
    }
    async function createAccount(token, name = 'Main Account', type = 'bank') {
        const response = await request(app.server)
            .post('/accounts')
            .set('Authorization', `Bearer ${token}`)
            .send({
            name,
            type,
            currency: 'TRY',
        });
        expect(response.status).toBe(201);
        return response.body;
    }
    async function createExpenseCategory(token, name = 'Bills') {
        const response = await request(app.server)
            .post('/categories')
            .set('Authorization', `Bearer ${token}`)
            .send({
            name,
            type: 'expense',
            color: '#2563EB',
            icon: 'receipt-outline',
        });
        expect(response.status).toBe(201);
        return response.body;
    }
    it('creates upcoming payment, supports listing/filtering, and enforces object-level auth', async () => {
        const owner = await registerUser('upcoming-owner@example.com', 'Owner');
        const attacker = await registerUser('upcoming-attacker@example.com', 'Attacker');
        await createAccount(owner.accessToken);
        const create = await request(app.server)
            .post('/upcoming-payments')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({
            title: 'Internet Bill',
            type: 'bill',
            amount: 890.5,
            currency: 'TRY',
            dueDate: '2026-02-25T10:00:00.000Z',
            source: 'ocr',
        });
        expect(create.status).toBe(201);
        expect(create.body.title).toBe('Internet Bill');
        expect(create.body.status).toBe('upcoming');
        const ownerList = await request(app.server)
            .get('/upcoming-payments')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .query({ from: '2026-02-01', to: '2026-03-01', status: 'upcoming' });
        expect(ownerList.status).toBe(200);
        expect(ownerList.body.upcomingPayments).toHaveLength(1);
        expect(ownerList.body.upcomingPayments[0].title).toBe('Internet Bill');
        const ownerPaidFilter = await request(app.server)
            .get('/upcoming-payments')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .query({ from: '2026-02-01', to: '2026-03-01', status: 'paid' });
        expect(ownerPaidFilter.status).toBe(200);
        expect(ownerPaidFilter.body.upcomingPayments).toHaveLength(0);
        const attackerList = await request(app.server)
            .get('/upcoming-payments')
            .set('Authorization', `Bearer ${attacker.accessToken}`)
            .query({ from: '2026-02-01', to: '2026-03-01', status: 'upcoming' });
        expect(attackerList.status).toBe(200);
        expect(attackerList.body.upcomingPayments).toHaveLength(0);
        const attackerPatch = await request(app.server)
            .patch(`/upcoming-payments/${create.body.id}`)
            .set('Authorization', `Bearer ${attacker.accessToken}`)
            .send({ title: 'Hacked title' });
        expect(attackerPatch.status).toBe(404);
        expect(attackerPatch.body.error.code).toBe('UPCOMING_PAYMENT_NOT_FOUND');
    });
    it('mark-paid creates expense transaction and is idempotent', async () => {
        const owner = await registerUser('upcoming-mark-paid@example.com', 'Owner');
        const attacker = await registerUser('upcoming-mark-paid-attacker@example.com', 'Attacker');
        const account = await createAccount(owner.accessToken, 'Wallet', 'cash');
        await createExpenseCategory(owner.accessToken, 'Bills');
        const create = await request(app.server)
            .post('/upcoming-payments')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({
            title: 'Rent February',
            type: 'rent',
            amount: 12500,
            currency: 'TRY',
            dueDate: '2026-02-26T10:00:00.000Z',
            source: 'manual',
        });
        expect(create.status).toBe(201);
        const firstMarkPaid = await request(app.server)
            .post(`/upcoming-payments/${create.body.id}/mark-paid`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ accountId: account.id });
        expect(firstMarkPaid.status).toBe(200);
        expect(firstMarkPaid.body.upcomingPayment.status).toBe('paid');
        expect(firstMarkPaid.body.transaction).toBeTruthy();
        expect(firstMarkPaid.body.transaction.type).toBe('expense');
        expect(firstMarkPaid.body.transaction.amount).toBe(12500);
        expect(firstMarkPaid.body.transaction.currency).toBe('TRY');
        const secondMarkPaid = await request(app.server)
            .post(`/upcoming-payments/${create.body.id}/mark-paid`)
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({ accountId: account.id });
        expect(secondMarkPaid.status).toBe(200);
        expect(secondMarkPaid.body.upcomingPayment.status).toBe('paid');
        expect(secondMarkPaid.body.transaction.id).toBe(firstMarkPaid.body.transaction.id);
        const transactions = await request(app.server)
            .get('/transactions')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .query({ search: 'Rent February' });
        expect(transactions.status).toBe(200);
        expect(transactions.body.transactions).toHaveLength(1);
        const attackerMarkPaid = await request(app.server)
            .post(`/upcoming-payments/${create.body.id}/mark-paid`)
            .set('Authorization', `Bearer ${attacker.accessToken}`)
            .send({ accountId: account.id });
        expect(attackerMarkPaid.status).toBe(404);
        expect(attackerMarkPaid.body.error.code).toBe('UPCOMING_PAYMENT_NOT_FOUND');
    });
    it('dashboard includes due-soon upcoming payments', async () => {
        const owner = await registerUser('upcoming-dashboard@example.com', 'Owner');
        const authHeader = { Authorization: `Bearer ${owner.accessToken}` };
        await createAccount(owner.accessToken, 'Main', 'bank');
        const now = new Date();
        const dueSoon = new Date(now);
        dueSoon.setDate(dueSoon.getDate() + 2);
        const notDueSoon = new Date(now);
        notDueSoon.setDate(notDueSoon.getDate() + 12);
        const createDueSoon = await request(app.server).post('/upcoming-payments').set(authHeader).send({
            title: 'Electricity',
            type: 'bill',
            amount: 450,
            currency: 'TRY',
            dueDate: dueSoon.toISOString(),
            source: 'manual',
        });
        expect(createDueSoon.status).toBe(201);
        const createLater = await request(app.server).post('/upcoming-payments').set(authHeader).send({
            title: 'Gym',
            type: 'subscription',
            amount: 650,
            currency: 'TRY',
            dueDate: notDueSoon.toISOString(),
            source: 'manual',
        });
        expect(createLater.status).toBe(201);
        const dashboard = await request(app.server).get('/dashboard/recent').set(authHeader);
        expect(dashboard.status).toBe(200);
        expect(Array.isArray(dashboard.body.upcomingPaymentsDueSoon)).toBe(true);
        expect(dashboard.body.upcomingPaymentsDueSoon).toHaveLength(1);
        expect(dashboard.body.upcomingPaymentsDueSoon[0].title).toBe('Electricity');
    });
    it('enforces single-currency invariant for upcoming payment creation', async () => {
        const owner = await registerUser('upcoming-currency@example.com', 'Owner');
        await createAccount(owner.accessToken, 'Main', 'bank');
        const create = await request(app.server)
            .post('/upcoming-payments')
            .set('Authorization', `Bearer ${owner.accessToken}`)
            .send({
            title: 'Foreign Bill',
            type: 'bill',
            amount: 100,
            currency: 'USD',
            dueDate: '2026-02-26T10:00:00.000Z',
            source: 'ocr',
        });
        expect(create.status).toBe(400);
        expect(create.body.error.code).toBe('BASE_CURRENCY_MISMATCH');
    });
});
