import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountModel } from '../src/models/Account.js';
import { BudgetModel } from '../src/models/Budget.js';
import { CategoryModel } from '../src/models/Category.js';
import { GroupExpenseModel } from '../src/models/GroupExpense.js';
import { GroupModel } from '../src/models/Group.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { RecurringRunLogModel } from '../src/models/RecurringRunLog.js';
import { RecurringRuleModel } from '../src/models/RecurringRule.js';
import { TransactionModel } from '../src/models/Transaction.js';
import { UserModel } from '../src/models/User.js';
import { buildServer } from '../src/server.js';
describe('Auth + Finance API', () => {
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
        app = buildServer({ logger: false });
        await app.ready();
    }, 120000);
    beforeEach(async () => {
        await BudgetModel.deleteMany({});
        await TransactionModel.deleteMany({});
        await RecurringRunLogModel.deleteMany({});
        await RecurringRuleModel.deleteMany({});
        await GroupExpenseModel.deleteMany({});
        await GroupModel.deleteMany({});
        await CategoryModel.deleteMany({});
        await AccountModel.deleteMany({});
        await RefreshTokenModel.deleteMany({});
        await UserModel.deleteMany({});
    });
    afterAll(async () => {
        await app.close();
        if (mongo) {
            await mongo.stop();
        }
    }, 60000);
    async function registerUser(email, name = 'Fin User') {
        const response = await request(app.server).post('/auth/register').send({
            email,
            password: 'Password123',
            name,
        });
        expect(response.status).toBe(201);
        return response.body;
    }
    it('register -> login -> me success', async () => {
        const registerResponse = await request(app.server).post('/auth/register').send({
            email: 'user@example.com',
            password: 'Password123',
            name: 'Fin User',
        });
        expect(registerResponse.status).toBe(201);
        expect(registerResponse.body.user.email).toBe('user@example.com');
        expect(registerResponse.body.accessToken).toBeTypeOf('string');
        expect(registerResponse.body.refreshToken).toBeTypeOf('string');
        const loginResponse = await request(app.server).post('/auth/login').send({
            email: 'user@example.com',
            password: 'Password123',
        });
        expect(loginResponse.status).toBe(200);
        expect(loginResponse.body.user.email).toBe('user@example.com');
        const meResponse = await request(app.server)
            .get('/me')
            .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);
        expect(meResponse.status).toBe(200);
        expect(meResponse.body).toEqual({
            user: {
                id: loginResponse.body.user.id,
                email: 'user@example.com',
                name: 'Fin User',
                baseCurrency: null,
                savingsTargetRate: 20,
                riskProfile: 'medium',
            },
        });
    });
    it('allows creating multiple users without firebaseUid', async () => {
        const firstUser = await request(app.server).post('/auth/register').send({
            email: 'first-no-firebase@example.com',
            password: 'Password123',
            name: 'First User',
        });
        expect(firstUser.status).toBe(201);
        const secondUser = await request(app.server).post('/auth/register').send({
            email: 'second-no-firebase@example.com',
            password: 'Password123',
            name: 'Second User',
        });
        expect(secondUser.status).toBe(201);
    });
    it('returns invalid credentials on wrong password', async () => {
        await request(app.server).post('/auth/register').send({
            email: 'user@example.com',
            password: 'Password123',
            name: 'Fin User',
        });
        const response = await request(app.server).post('/auth/login').send({
            email: 'user@example.com',
            password: 'WrongPassword',
        });
        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: {
                code: 'INVALID_CREDENTIALS',
                message: 'Invalid email or password',
            },
        });
    });
    it('rotates refresh token and invalidates old refresh token', async () => {
        await request(app.server).post('/auth/register').send({
            email: 'user@example.com',
            password: 'Password123',
            name: 'Fin User',
        });
        const loginResponse = await request(app.server).post('/auth/login').send({
            email: 'user@example.com',
            password: 'Password123',
        });
        const oldRefreshToken = loginResponse.body.refreshToken;
        const firstRefresh = await request(app.server).post('/auth/refresh').send({
            refreshToken: oldRefreshToken,
        });
        expect(firstRefresh.status).toBe(200);
        expect(firstRefresh.body.refreshToken).not.toBe(oldRefreshToken);
        const reuseOldRefresh = await request(app.server).post('/auth/refresh').send({
            refreshToken: oldRefreshToken,
        });
        expect(reuseOldRefresh.status).toBe(401);
        expect(reuseOldRefresh.body).toEqual({
            error: {
                code: 'INVALID_REFRESH_TOKEN',
                message: 'Refresh token is invalid or expired',
            },
        });
    });
    it('logout revokes refresh token', async () => {
        await request(app.server).post('/auth/register').send({
            email: 'user@example.com',
            password: 'Password123',
            name: 'Fin User',
        });
        const loginResponse = await request(app.server).post('/auth/login').send({
            email: 'user@example.com',
            password: 'Password123',
        });
        const refreshToken = loginResponse.body.refreshToken;
        const logoutResponse = await request(app.server).post('/auth/logout').send({ refreshToken });
        expect(logoutResponse.status).toBe(200);
        expect(logoutResponse.body).toEqual({ ok: true });
        const refreshAfterLogout = await request(app.server).post('/auth/refresh').send({ refreshToken });
        expect(refreshAfterLogout.status).toBe(401);
        expect(refreshAfterLogout.body).toEqual({
            error: {
                code: 'INVALID_REFRESH_TOKEN',
                message: 'Refresh token is invalid or expired',
            },
        });
    });
    it('logout returns INVALID_REFRESH_TOKEN for malformed refresh token', async () => {
        const response = await request(app.server).post('/auth/logout').send({
            refreshToken: 'not-a-valid-jwt',
        });
        expect(response.status).toBe(401);
        expect(response.body.error?.code).toBe('INVALID_REFRESH_TOKEN');
    });
    it('/me requires auth token', async () => {
        const response = await request(app.server).get('/me');
        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Missing Authorization header',
            },
        });
    });
    it('first account creation sets user baseCurrency', async () => {
        const session = await registerUser('base-currency-owner@example.com', 'Base Currency Owner');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const createAccount = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        expect(createAccount.status).toBe(201);
        const meResponse = await request(app.server).get('/me').set(authHeader);
        expect(meResponse.status).toBe(200);
        expect(meResponse.body.user.baseCurrency).toBe('USD');
    });
    it('creating second account with different currency fails', async () => {
        const session = await registerUser('second-account-currency@example.com', 'Currency Guard');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const firstAccount = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Primary',
            type: 'bank',
            currency: 'USD',
        });
        expect(firstAccount.status).toBe(201);
        const secondAccount = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Secondary',
            type: 'cash',
            currency: 'EUR',
        });
        expect(secondAccount.status).toBe(400);
        expect(secondAccount.body).toEqual({
            error: {
                code: 'BASE_CURRENCY_MISMATCH',
                message: 'Account currency must match your base currency',
            },
        });
    });
    it('updating account currency to a different currency fails', async () => {
        const session = await registerUser('update-currency-owner@example.com', 'Update Currency Owner');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        expect(account.status).toBe(201);
        const updateAccount = await request(app.server)
            .patch(`/accounts/${account.body.id}`)
            .set(authHeader)
            .send({ currency: 'EUR' });
        expect(updateAccount.status).toBe(400);
        expect(updateAccount.body).toEqual({
            error: {
                code: 'BASE_CURRENCY_MISMATCH',
                message: 'Account currency must match your base currency',
            },
        });
    });
    it('account CRUD', async () => {
        const session = await registerUser('account-owner@example.com', 'Account Owner');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const createAccount = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Wallet',
            type: 'cash',
            currency: 'USD',
        });
        expect(createAccount.status).toBe(201);
        expect(createAccount.body.name).toBe('Wallet');
        const accountId = createAccount.body.id;
        const listAccounts = await request(app.server).get('/accounts').set(authHeader);
        expect(listAccounts.status).toBe(200);
        expect(listAccounts.body.accounts).toHaveLength(1);
        expect(listAccounts.body.accounts[0].id).toBe(accountId);
        const updateAccount = await request(app.server).patch(`/accounts/${accountId}`).set(authHeader).send({
            name: 'Main Wallet',
            type: 'bank',
        });
        expect(updateAccount.status).toBe(200);
        expect(updateAccount.body.name).toBe('Main Wallet');
        expect(updateAccount.body.type).toBe('bank');
        const deleteAccount = await request(app.server).delete(`/accounts/${accountId}`).set(authHeader);
        expect(deleteAccount.status).toBe(200);
        expect(deleteAccount.body).toEqual({ ok: true });
        const listAfterDelete = await request(app.server).get('/accounts').set(authHeader);
        expect(listAfterDelete.status).toBe(200);
        expect(listAfterDelete.body.accounts).toHaveLength(0);
    });
    it('transaction CRUD', async () => {
        const session = await registerUser('tx-owner@example.com', 'Tx Owner');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const accountResponse = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Checking',
            type: 'bank',
            currency: 'USD',
        });
        expect(accountResponse.status).toBe(201);
        const categoryResponse = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Groceries',
            type: 'expense',
            color: '#12AA34',
            icon: 'cart',
        });
        expect(categoryResponse.status).toBe(201);
        const createTx = await request(app.server).post('/transactions').set(authHeader).send({
            accountId: accountResponse.body.id,
            categoryId: categoryResponse.body.id,
            type: 'expense',
            amount: 45.5,
            currency: 'USD',
            description: 'Weekly grocery',
            occurredAt: '2026-02-10T10:30:00.000Z',
        });
        expect(createTx.status).toBe(201);
        expect(createTx.body.amount).toBe(45.5);
        const transactionId = createTx.body.id;
        const getTx = await request(app.server).get(`/transactions/${transactionId}`).set(authHeader);
        expect(getTx.status).toBe(200);
        expect(getTx.body.description).toBe('Weekly grocery');
        const updateTx = await request(app.server).patch(`/transactions/${transactionId}`).set(authHeader).send({
            amount: 50,
            description: 'Weekly grocery updated',
        });
        expect(updateTx.status).toBe(200);
        expect(updateTx.body.amount).toBe(50);
        expect(updateTx.body.description).toBe('Weekly grocery updated');
        const deleteTx = await request(app.server).delete(`/transactions/${transactionId}`).set(authHeader);
        expect(deleteTx.status).toBe(200);
        expect(deleteTx.body).toEqual({ ok: true });
        const getAfterDelete = await request(app.server).get(`/transactions/${transactionId}`).set(authHeader);
        expect(getAfterDelete.status).toBe(404);
        expect(getAfterDelete.body.error.code).toBe('TRANSACTION_NOT_FOUND');
    });
    it('transaction listing supports pagination and filters', async () => {
        const session = await registerUser('filter-owner@example.com', 'Filter Owner');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const accountA = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Primary',
            type: 'bank',
            currency: 'USD',
        });
        const accountB = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Cash',
            type: 'cash',
            currency: 'USD',
        });
        expect(accountA.status).toBe(201);
        expect(accountB.status).toBe(201);
        const expenseCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Coffee',
            type: 'expense',
            color: '#AA2211',
            icon: 'cup',
        });
        const incomeCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Salary',
            type: 'income',
            color: '#11AA44',
            icon: 'banknote',
        });
        expect(expenseCategory.status).toBe(201);
        expect(incomeCategory.status).toBe(201);
        const txPayloads = [
            {
                accountId: accountA.body.id,
                categoryId: expenseCategory.body.id,
                type: 'expense',
                amount: 8,
                currency: 'USD',
                description: 'Morning coffee',
                occurredAt: '2026-02-11T08:00:00.000Z',
            },
            {
                accountId: accountA.body.id,
                categoryId: incomeCategory.body.id,
                type: 'income',
                amount: 1200,
                currency: 'USD',
                description: 'Monthly salary',
                occurredAt: '2026-02-09T08:00:00.000Z',
            },
            {
                accountId: accountB.body.id,
                categoryId: expenseCategory.body.id,
                type: 'expense',
                amount: 20,
                currency: 'USD',
                description: 'Coffee beans',
                occurredAt: '2026-02-12T08:00:00.000Z',
            },
        ];
        for (const payload of txPayloads) {
            const created = await request(app.server).post('/transactions').set(authHeader).send(payload);
            expect(created.status).toBe(201);
        }
        const expensePageOne = await request(app.server)
            .get('/transactions')
            .set(authHeader)
            .query({ type: 'expense', limit: 1, page: 1 });
        expect(expensePageOne.status).toBe(200);
        expect(expensePageOne.body.transactions).toHaveLength(1);
        expect(expensePageOne.body.pagination.total).toBe(2);
        expect(expensePageOne.body.pagination.totalPages).toBe(2);
        expect(expensePageOne.body.transactions[0].type).toBe('expense');
        const byAccountAndDate = await request(app.server)
            .get('/transactions')
            .set(authHeader)
            .query({
            accountId: accountA.body.id,
            from: '2026-02-10T00:00:00.000Z',
            to: '2026-02-12T23:59:59.000Z',
        });
        expect(byAccountAndDate.status).toBe(200);
        expect(byAccountAndDate.body.transactions).toHaveLength(1);
        expect(byAccountAndDate.body.transactions[0].description).toBe('Morning coffee');
        const bySearch = await request(app.server).get('/transactions').set(authHeader).query({ search: 'salary' });
        expect(bySearch.status).toBe(200);
        expect(bySearch.body.transactions).toHaveLength(1);
        expect(bySearch.body.transactions[0].description).toBe('Monthly salary');
    });
    it('cannot access another user transaction (object-level auth)', async () => {
        const owner = await registerUser('owner@example.com', 'Owner');
        const ownerHeader = { Authorization: `Bearer ${owner.accessToken}` };
        const attacker = await registerUser('attacker@example.com', 'Attacker');
        const attackerHeader = { Authorization: `Bearer ${attacker.accessToken}` };
        const ownerAccount = await request(app.server).post('/accounts').set(ownerHeader).send({
            name: 'Owner Account',
            type: 'bank',
            currency: 'USD',
        });
        const ownerCategory = await request(app.server).post('/categories').set(ownerHeader).send({
            name: 'Owner Expense',
            type: 'expense',
            color: '#334455',
            icon: 'shield',
        });
        expect(ownerAccount.status).toBe(201);
        expect(ownerCategory.status).toBe(201);
        const ownerTransaction = await request(app.server).post('/transactions').set(ownerHeader).send({
            accountId: ownerAccount.body.id,
            categoryId: ownerCategory.body.id,
            type: 'expense',
            amount: 99,
            currency: 'USD',
            description: 'Private transaction',
            occurredAt: '2026-02-12T08:00:00.000Z',
        });
        expect(ownerTransaction.status).toBe(201);
        const transactionId = ownerTransaction.body.id;
        const attackerGet = await request(app.server)
            .get(`/transactions/${transactionId}`)
            .set(attackerHeader);
        expect(attackerGet.status).toBe(404);
        expect(attackerGet.body.error.code).toBe('TRANSACTION_NOT_FOUND');
        const attackerPatch = await request(app.server)
            .patch(`/transactions/${transactionId}`)
            .set(attackerHeader)
            .send({ description: 'hacked' });
        expect(attackerPatch.status).toBe(404);
        expect(attackerPatch.body.error.code).toBe('TRANSACTION_NOT_FOUND');
        const attackerDelete = await request(app.server)
            .delete(`/transactions/${transactionId}`)
            .set(attackerHeader);
        expect(attackerDelete.status).toBe(404);
        expect(attackerDelete.body.error.code).toBe('TRANSACTION_NOT_FOUND');
    });
    it('analytics summary returns month totals and top categories', async () => {
        const session = await registerUser('analytics-summary@example.com', 'Analytics Summary');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        expect(account.status).toBe(201);
        const groceriesCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Groceries',
            type: 'expense',
            color: '#00AA44',
            icon: 'cart',
        });
        const rentCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Rent',
            type: 'expense',
            color: '#AA0044',
            icon: 'home',
        });
        const salaryCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Salary',
            type: 'income',
            color: '#4455AA',
            icon: 'wallet',
        });
        expect(groceriesCategory.status).toBe(201);
        expect(rentCategory.status).toBe(201);
        expect(salaryCategory.status).toBe(201);
        const payloads = [
            {
                accountId: account.body.id,
                categoryId: salaryCategory.body.id,
                type: 'income',
                amount: 3000,
                currency: 'USD',
                description: 'March salary',
                occurredAt: '2026-03-01T12:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: groceriesCategory.body.id,
                type: 'expense',
                amount: 200,
                currency: 'USD',
                description: 'Groceries',
                occurredAt: '2026-03-08T12:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: rentCategory.body.id,
                type: 'expense',
                amount: 1000,
                currency: 'USD',
                description: 'Rent',
                occurredAt: '2026-03-05T12:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: groceriesCategory.body.id,
                type: 'expense',
                amount: 80,
                currency: 'USD',
                description: 'Outside month',
                occurredAt: '2026-04-03T12:00:00.000Z',
            },
        ];
        for (const payload of payloads) {
            const created = await request(app.server).post('/transactions').set(authHeader).send(payload);
            expect(created.status).toBe(201);
        }
        const summary = await request(app.server)
            .get('/analytics/summary')
            .set(authHeader)
            .query({ month: '2026-03' });
        expect(summary.status).toBe(200);
        expect(summary.body.month).toBe('2026-03');
        expect(summary.body.currency).toBe('USD');
        expect(summary.body.incomeTotal).toBe(3000);
        expect(summary.body.expenseTotal).toBe(1200);
        expect(summary.body.netTotal).toBe(1800);
        expect(summary.body.transactionCount).toBe(3);
        const groceries = summary.body.topCategories.find((category) => category.name === 'Groceries');
        const salary = summary.body.topCategories.find((category) => category.name === 'Salary');
        expect(groceries).toBeDefined();
        expect(groceries.percent).toBeCloseTo((200 / 1200) * 100, 5);
        expect(salary).toBeDefined();
        expect(salary.percent).toBeCloseTo(100, 5);
    });
    it('analytics by-category returns grouped totals sorted desc', async () => {
        const session = await registerUser('analytics-category@example.com', 'Analytics Category');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        expect(account.status).toBe(201);
        const coffeeCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Coffee',
            type: 'expense',
            color: '#663300',
            icon: 'cup',
        });
        const travelCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Travel',
            type: 'expense',
            color: '#003366',
            icon: 'plane',
        });
        expect(coffeeCategory.status).toBe(201);
        expect(travelCategory.status).toBe(201);
        const payloads = [
            {
                accountId: account.body.id,
                categoryId: travelCategory.body.id,
                type: 'expense',
                amount: 900,
                currency: 'USD',
                description: 'Trip',
                occurredAt: '2026-05-01T12:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: coffeeCategory.body.id,
                type: 'expense',
                amount: 20,
                currency: 'USD',
                description: 'Coffee #1',
                occurredAt: '2026-05-02T12:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: coffeeCategory.body.id,
                type: 'expense',
                amount: 10,
                currency: 'USD',
                description: 'Coffee #2',
                occurredAt: '2026-05-03T12:00:00.000Z',
            },
        ];
        for (const payload of payloads) {
            const created = await request(app.server).post('/transactions').set(authHeader).send(payload);
            expect(created.status).toBe(201);
        }
        const byCategory = await request(app.server)
            .get('/analytics/by-category')
            .set(authHeader)
            .query({ month: '2026-05', type: 'expense' });
        expect(byCategory.status).toBe(200);
        expect(byCategory.body.month).toBe('2026-05');
        expect(byCategory.body.type).toBe('expense');
        expect(byCategory.body.currency).toBe('USD');
        expect(byCategory.body.categories).toHaveLength(2);
        expect(byCategory.body.categories[0].name).toBe('Travel');
        expect(byCategory.body.categories[0].total).toBe(900);
        expect(byCategory.body.categories[1].name).toBe('Coffee');
        expect(byCategory.body.categories[1].total).toBe(30);
        expect(byCategory.body.categories[1].count).toBe(2);
    });
    it('analytics trend includes zero-filled missing months', async () => {
        const session = await registerUser('analytics-trend@example.com', 'Analytics Trend');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        expect(account.status).toBe(201);
        const salaryCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Salary',
            type: 'income',
            color: '#11AA44',
            icon: 'wallet',
        });
        const groceriesCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Groceries',
            type: 'expense',
            color: '#AA1144',
            icon: 'cart',
        });
        expect(salaryCategory.status).toBe(201);
        expect(groceriesCategory.status).toBe(201);
        const payloads = [
            {
                accountId: account.body.id,
                categoryId: salaryCategory.body.id,
                type: 'income',
                amount: 1000,
                currency: 'USD',
                description: 'January income',
                occurredAt: '2026-01-15T12:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: groceriesCategory.body.id,
                type: 'expense',
                amount: 200,
                currency: 'USD',
                description: 'March expense',
                occurredAt: '2026-03-15T12:00:00.000Z',
            },
        ];
        for (const payload of payloads) {
            const created = await request(app.server).post('/transactions').set(authHeader).send(payload);
            expect(created.status).toBe(201);
        }
        const trend = await request(app.server)
            .get('/analytics/trend')
            .set(authHeader)
            .query({ from: '2026-01', to: '2026-03' });
        expect(trend.status).toBe(200);
        expect(trend.body.currency).toBe('USD');
        expect(trend.body.points).toEqual([
            {
                month: '2026-01',
                incomeTotal: 1000,
                expenseTotal: 0,
                netTotal: 1000,
            },
            {
                month: '2026-02',
                incomeTotal: 0,
                expenseTotal: 0,
                netTotal: 0,
            },
            {
                month: '2026-03',
                incomeTotal: 0,
                expenseTotal: 200,
                netTotal: -200,
            },
        ]);
    });
    it('ai advice returns rule-based insights and next actions', async () => {
        const session = await registerUser('ai-advice@example.com', 'AI Advice');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        expect(account.status).toBe(201);
        const salaryCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Salary',
            type: 'income',
            color: '#22AA55',
            icon: 'wallet',
        });
        const foodCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Food',
            type: 'expense',
            color: '#AA5533',
            icon: 'fork',
        });
        const travelCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Travel',
            type: 'expense',
            color: '#3355AA',
            icon: 'bus',
        });
        expect(salaryCategory.status).toBe(201);
        expect(foodCategory.status).toBe(201);
        expect(travelCategory.status).toBe(201);
        const budget = await request(app.server).post('/budgets').set(authHeader).send({
            categoryId: foodCategory.body.id,
            month: '2026-10',
            limitAmount: 100,
        });
        expect(budget.status).toBe(201);
        const payloads = [
            {
                accountId: account.body.id,
                categoryId: salaryCategory.body.id,
                type: 'income',
                amount: 1000,
                currency: 'USD',
                description: 'Monthly salary',
                occurredAt: '2026-10-01T09:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: foodCategory.body.id,
                type: 'expense',
                amount: 180,
                currency: 'USD',
                description: 'Food spending',
                occurredAt: '2026-10-07T09:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: travelCategory.body.id,
                type: 'expense',
                amount: 120,
                currency: 'USD',
                description: 'Metro and taxi',
                occurredAt: '2026-10-11T09:00:00.000Z',
            },
        ];
        for (const payload of payloads) {
            const created = await request(app.server).post('/transactions').set(authHeader).send(payload);
            expect(created.status).toBe(201);
        }
        const advice = await request(app.server)
            .get('/ai/advice')
            .set(authHeader)
            .query({ month: '2026-10' });
        expect(advice.status).toBe(200);
        expect(advice.body.month).toBe('2026-10');
        expect(advice.body.currency).toBe('USD');
        expect(advice.body.totalIncome).toBe(1000);
        expect(advice.body.totalExpense).toBe(300);
        expect(advice.body.net).toBe(700);
        expect(advice.body.topExpenseCategory?.name).toBe('Food');
        expect(advice.body.budgetOverruns).toHaveLength(1);
        expect(advice.body.budgetOverruns[0].categoryName).toBe('Food');
        expect(advice.body.budgetOverruns[0].overAmount).toBe(80);
        expect(advice.body.advice.length).toBeGreaterThan(0);
        expect(advice.body.nextActions.length).toBeGreaterThan(0);
    });
    it('weekly report returns health score, highlights, risks and forecast', async () => {
        const session = await registerUser('weekly-report@example.com', 'Weekly Report');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        expect(account.status).toBe(201);
        const incomeCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Salary',
            type: 'income',
            color: '#22AA55',
            icon: 'wallet',
        });
        const expenseCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Rent',
            type: 'expense',
            color: '#AA2255',
            icon: 'home',
        });
        expect(incomeCategory.status).toBe(201);
        expect(expenseCategory.status).toBe(201);
        const budget = await request(app.server).post('/budgets').set(authHeader).send({
            categoryId: expenseCategory.body.id,
            month: '2026-11',
            limitAmount: 500,
        });
        expect(budget.status).toBe(201);
        const payloads = [
            {
                accountId: account.body.id,
                categoryId: incomeCategory.body.id,
                type: 'income',
                amount: 1000,
                currency: 'USD',
                description: 'Income',
                occurredAt: '2026-11-04T10:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: expenseCategory.body.id,
                type: 'expense',
                amount: 950,
                currency: 'USD',
                description: 'Rent and extras',
                occurredAt: '2026-11-05T10:00:00.000Z',
            },
        ];
        for (const payload of payloads) {
            const created = await request(app.server).post('/transactions').set(authHeader).send(payload);
            expect(created.status).toBe(201);
        }
        const report = await request(app.server)
            .get('/reports/weekly')
            .set(authHeader)
            .query({ weekStart: '2026-11-03' });
        expect(report.status).toBe(200);
        expect(report.body.weekStart).toBe('2026-11-03');
        expect(report.body.weekEnd).toBe('2026-11-09');
        expect(report.body.currency).toBe('USD');
        expect(report.body.healthScore).toBeGreaterThanOrEqual(0);
        expect(report.body.healthScore).toBeLessThanOrEqual(100);
        expect(typeof report.body.summaryText).toBe('string');
        expect(report.body.summaryText.length).toBeGreaterThan(0);
        expect(report.body.highlights.length).toBeGreaterThan(0);
        expect(report.body.riskFlags.length).toBeGreaterThan(0);
        expect(typeof report.body.nextWeekForecastText).toBe('string');
        expect(report.body.nextWeekForecastText.length).toBeGreaterThan(0);
    });
    it('budgets create and usage reflects month expense transactions', async () => {
        const session = await registerUser('budget-usage@example.com', 'Budget Usage');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        expect(account.status).toBe(201);
        const expenseCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Dining',
            type: 'expense',
            color: '#CC5500',
            icon: 'utensils',
        });
        expect(expenseCategory.status).toBe(201);
        const budgetCreate = await request(app.server).post('/budgets').set(authHeader).send({
            categoryId: expenseCategory.body.id,
            month: '2026-06',
            limitAmount: 100,
        });
        expect(budgetCreate.status).toBe(201);
        const payloads = [
            {
                accountId: account.body.id,
                categoryId: expenseCategory.body.id,
                type: 'expense',
                amount: 20,
                currency: 'USD',
                description: 'Meal 1',
                occurredAt: '2026-06-02T12:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: expenseCategory.body.id,
                type: 'expense',
                amount: 35,
                currency: 'USD',
                description: 'Meal 2',
                occurredAt: '2026-06-10T12:00:00.000Z',
            },
            {
                accountId: account.body.id,
                categoryId: expenseCategory.body.id,
                type: 'expense',
                amount: 12,
                currency: 'USD',
                description: 'Outside month',
                occurredAt: '2026-07-02T12:00:00.000Z',
            },
        ];
        for (const payload of payloads) {
            const created = await request(app.server).post('/transactions').set(authHeader).send(payload);
            expect(created.status).toBe(201);
        }
        const budgets = await request(app.server).get('/budgets').set(authHeader).query({ month: '2026-06' });
        expect(budgets.status).toBe(200);
        expect(budgets.body.budgets).toHaveLength(1);
        expect(budgets.body.budgets[0].categoryName).toBe('Dining');
        expect(budgets.body.budgets[0].spentAmount).toBe(55);
        expect(budgets.body.budgets[0].remainingAmount).toBe(45);
        expect(budgets.body.budgets[0].percentUsed).toBeCloseTo(55, 5);
    });
    it('cannot create budget for income category', async () => {
        const session = await registerUser('budget-income@example.com', 'Budget Income');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        const incomeCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Salary',
            type: 'income',
            color: '#00AA44',
            icon: 'wallet',
        });
        expect(incomeCategory.status).toBe(201);
        const createBudget = await request(app.server).post('/budgets').set(authHeader).send({
            categoryId: incomeCategory.body.id,
            month: '2026-06',
            limitAmount: 200,
        });
        expect(createBudget.status).toBe(400);
        expect(createBudget.body).toEqual({
            error: {
                code: 'INVALID_BUDGET_CATEGORY',
                message: 'Category must be an expense category',
            },
        });
    });
    it('budget routes enforce object-level authorization', async () => {
        const owner = await registerUser('budget-owner@example.com', 'Budget Owner');
        const ownerHeader = { Authorization: `Bearer ${owner.accessToken}` };
        const attacker = await registerUser('budget-attacker@example.com', 'Budget Attacker');
        const attackerHeader = { Authorization: `Bearer ${attacker.accessToken}` };
        await request(app.server).post('/accounts').set(ownerHeader).send({
            name: 'Owner Main',
            type: 'bank',
            currency: 'USD',
        });
        const ownerCategory = await request(app.server).post('/categories').set(ownerHeader).send({
            name: 'Owner Category',
            type: 'expense',
            color: '#2222AA',
            icon: 'shield',
        });
        expect(ownerCategory.status).toBe(201);
        const ownerBudget = await request(app.server).post('/budgets').set(ownerHeader).send({
            categoryId: ownerCategory.body.id,
            month: '2026-08',
            limitAmount: 500,
        });
        expect(ownerBudget.status).toBe(201);
        const patchByAttacker = await request(app.server)
            .patch(`/budgets/${ownerBudget.body.id}`)
            .set(attackerHeader)
            .send({ limitAmount: 900 });
        expect(patchByAttacker.status).toBe(404);
        expect(patchByAttacker.body.error.code).toBe('BUDGET_NOT_FOUND');
        const deleteByAttacker = await request(app.server)
            .delete(`/budgets/${ownerBudget.body.id}`)
            .set(attackerHeader);
        expect(deleteByAttacker.status).toBe(404);
        expect(deleteByAttacker.body.error.code).toBe('BUDGET_NOT_FOUND');
        const attackerBudgets = await request(app.server)
            .get('/budgets')
            .set(attackerHeader)
            .query({ month: '2026-08' });
        expect(attackerBudgets.status).toBe(200);
        expect(attackerBudgets.body.budgets).toEqual([]);
    });
    it('groups create/list/get works for owner', async () => {
        const session = await registerUser('groups-owner@example.com', 'Groups Owner');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const created = await request(app.server).post('/groups').set(authHeader).send({
            name: 'Istanbul Trip',
            members: [
                { name: 'Ayse', email: 'ayse@example.com' },
                { name: 'Mehmet', email: 'mehmet@example.com' },
            ],
        });
        expect(created.status).toBe(201);
        expect(created.body.name).toBe('Istanbul Trip');
        expect(created.body.members.length).toBe(3);
        expect(created.body.members[0].email).toBe('groups-owner@example.com');
        const listed = await request(app.server).get('/groups').set(authHeader);
        expect(listed.status).toBe(200);
        expect(listed.body.groups).toHaveLength(1);
        expect(listed.body.groups[0].id).toBe(created.body.id);
        const detail = await request(app.server).get(`/groups/${created.body.id}`).set(authHeader);
        expect(detail.status).toBe(200);
        expect(detail.body.id).toBe(created.body.id);
        expect(detail.body.members.map((member) => member.name)).toContain('Ayse');
    });
    it('group expenses create/list and settle marks unsettled expenses', async () => {
        const session = await registerUser('groups-expense@example.com', 'Groups Expense');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const createdGroup = await request(app.server).post('/groups').set(authHeader).send({
            name: 'Weekend Plan',
            members: [
                { name: 'Ali', email: 'ali@example.com' },
                { name: 'Ece', email: 'ece@example.com' },
            ],
        });
        expect(createdGroup.status).toBe(201);
        const ownerMemberId = createdGroup.body.members.find((member) => member.email === 'groups-expense@example.com')?.id;
        const aliMemberId = createdGroup.body.members.find((member) => member.email === 'ali@example.com')?.id;
        const eceMemberId = createdGroup.body.members.find((member) => member.email === 'ece@example.com')?.id;
        expect(ownerMemberId).toBeTypeOf('string');
        expect(aliMemberId).toBeTypeOf('string');
        expect(eceMemberId).toBeTypeOf('string');
        const createExpense = await request(app.server)
            .post(`/groups/${createdGroup.body.id}/expenses`)
            .set(authHeader)
            .send({
            paidByMemberId: ownerMemberId,
            title: 'Dinner',
            amount: 900,
            currency: 'TRY',
            splits: [
                { memberId: ownerMemberId, amount: 300 },
                { memberId: aliMemberId, amount: 300 },
                { memberId: eceMemberId, amount: 300 },
            ],
        });
        expect(createExpense.status).toBe(201);
        expect(createExpense.body.title).toBe('Dinner');
        expect(createExpense.body.settledAt).toBeNull();
        const expenses = await request(app.server)
            .get(`/groups/${createdGroup.body.id}/expenses`)
            .set(authHeader);
        expect(expenses.status).toBe(200);
        expect(expenses.body.expenses).toHaveLength(1);
        expect(expenses.body.expenses[0].splits).toHaveLength(3);
        const settle = await request(app.server)
            .post(`/groups/${createdGroup.body.id}/settle`)
            .set(authHeader)
            .send({});
        expect(settle.status).toBe(200);
        expect(settle.body.ok).toBe(true);
        expect(settle.body.settledCount).toBe(1);
        const settledExpenses = await request(app.server)
            .get(`/groups/${createdGroup.body.id}/expenses`)
            .set(authHeader);
        expect(settledExpenses.status).toBe(200);
        expect(settledExpenses.body.expenses[0].settledAt).toBeTypeOf('string');
    });
    it('groups enforce owner-only object-level authorization', async () => {
        const owner = await registerUser('groups-owner-only@example.com', 'Owner');
        const ownerHeader = { Authorization: `Bearer ${owner.accessToken}` };
        const attacker = await registerUser('groups-attacker@example.com', 'Attacker');
        const attackerHeader = { Authorization: `Bearer ${attacker.accessToken}` };
        const createdGroup = await request(app.server).post('/groups').set(ownerHeader).send({
            name: 'Private Group',
            members: [{ name: 'Friend', email: 'friend@example.com' }],
        });
        expect(createdGroup.status).toBe(201);
        const readAttempt = await request(app.server)
            .get(`/groups/${createdGroup.body.id}`)
            .set(attackerHeader);
        expect(readAttempt.status).toBe(404);
        expect(readAttempt.body.error.code).toBe('GROUP_NOT_FOUND');
        const expenseAttempt = await request(app.server)
            .post(`/groups/${createdGroup.body.id}/expenses`)
            .set(attackerHeader)
            .send({
            paidByMemberId: createdGroup.body.members[0].id,
            title: 'Hack attempt',
            amount: 50,
            currency: 'TRY',
            splits: [{ memberId: createdGroup.body.members[0].id, amount: 50 }],
        });
        expect(expenseAttempt.status).toBe(404);
        expect(expenseAttempt.body.error.code).toBe('GROUP_NOT_FOUND');
    });
    it('soft-deleted transaction is excluded from lists, analytics, and budget usage', async () => {
        const session = await registerUser('soft-delete-tx@example.com', 'Soft Delete');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        expect(account.status).toBe(201);
        const category = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Food',
            type: 'expense',
            color: '#AA3311',
            icon: 'utensils',
        });
        expect(category.status).toBe(201);
        const budget = await request(app.server).post('/budgets').set(authHeader).send({
            categoryId: category.body.id,
            month: '2026-09',
            limitAmount: 200,
        });
        expect(budget.status).toBe(201);
        const createdTx = await request(app.server).post('/transactions').set(authHeader).send({
            accountId: account.body.id,
            categoryId: category.body.id,
            type: 'expense',
            amount: 60,
            currency: 'USD',
            description: 'Lunch',
            occurredAt: '2026-09-07T12:00:00.000Z',
        });
        expect(createdTx.status).toBe(201);
        const deleted = await request(app.server)
            .delete(`/transactions/${createdTx.body.id}`)
            .set(authHeader);
        expect(deleted.status).toBe(200);
        const activeList = await request(app.server).get('/transactions').set(authHeader);
        expect(activeList.status).toBe(200);
        expect(activeList.body.transactions).toHaveLength(0);
        const includeDeletedList = await request(app.server)
            .get('/transactions')
            .set(authHeader)
            .query({ includeDeleted: true });
        expect(includeDeletedList.status).toBe(200);
        expect(includeDeletedList.body.transactions).toHaveLength(1);
        const analytics = await request(app.server)
            .get('/analytics/summary')
            .set(authHeader)
            .query({ month: '2026-09' });
        expect(analytics.status).toBe(200);
        expect(analytics.body.expenseTotal).toBe(0);
        expect(analytics.body.transactionCount).toBe(0);
        const budgets = await request(app.server).get('/budgets').set(authHeader).query({ month: '2026-09' });
        expect(budgets.status).toBe(200);
        expect(budgets.body.budgets).toHaveLength(1);
        expect(budgets.body.budgets[0].spentAmount).toBe(0);
    });
    it('creating a transfer creates paired in/out transactions', async () => {
        const session = await registerUser('transfer-pair@example.com', 'Transfer Pair');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const [fromAccount, toAccount] = await Promise.all([
            request(app.server).post('/accounts').set(authHeader).send({
                name: 'Checking',
                type: 'bank',
                currency: 'USD',
            }),
            request(app.server).post('/accounts').set(authHeader).send({
                name: 'Cash',
                type: 'cash',
                currency: 'USD',
            }),
        ]);
        expect(fromAccount.status).toBe(201);
        expect(toAccount.status).toBe(201);
        const transfer = await request(app.server).post('/transfers').set(authHeader).send({
            fromAccountId: fromAccount.body.id,
            toAccountId: toAccount.body.id,
            amount: 120.25,
            occurredAt: '2026-09-08T09:00:00.000Z',
            description: 'ATM cashout',
        });
        expect(transfer.status).toBe(201);
        expect(transfer.body.groupId).toBeTypeOf('string');
        expect(transfer.body.fromTransactionId).toBeTypeOf('string');
        expect(transfer.body.toTransactionId).toBeTypeOf('string');
        const transferList = await request(app.server)
            .get('/transactions')
            .set(authHeader)
            .query({ kind: 'transfer', limit: 50, page: 1 });
        expect(transferList.status).toBe(200);
        expect(transferList.body.transactions).toHaveLength(2);
        const directions = transferList.body.transactions.map((transaction) => transaction.transferDirection);
        expect(directions).toContain('in');
        expect(directions).toContain('out');
        const groupIds = new Set(transferList.body.transactions.map((transaction) => transaction.transferGroupId));
        expect(groupIds.size).toBe(1);
    });
    it('dashboard balances reflect transfer while total net stays unchanged', async () => {
        const session = await registerUser('transfer-balance@example.com', 'Transfer Balance');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const [accountA, accountB] = await Promise.all([
            request(app.server).post('/accounts').set(authHeader).send({
                name: 'Bank',
                type: 'bank',
                currency: 'USD',
            }),
            request(app.server).post('/accounts').set(authHeader).send({
                name: 'Wallet',
                type: 'cash',
                currency: 'USD',
            }),
        ]);
        expect(accountA.status).toBe(201);
        expect(accountB.status).toBe(201);
        const incomeCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Salary',
            type: 'income',
            color: '#11AA44',
            icon: 'wallet',
        });
        expect(incomeCategory.status).toBe(201);
        const seedIncome = await request(app.server).post('/transactions').set(authHeader).send({
            accountId: accountA.body.id,
            categoryId: incomeCategory.body.id,
            type: 'income',
            amount: 500,
            currency: 'USD',
            description: 'Seed funds',
            occurredAt: '2026-09-09T08:00:00.000Z',
        });
        expect(seedIncome.status).toBe(201);
        const transfer = await request(app.server).post('/transfers').set(authHeader).send({
            fromAccountId: accountA.body.id,
            toAccountId: accountB.body.id,
            amount: 200,
            occurredAt: '2026-09-09T09:00:00.000Z',
            description: 'Move to wallet',
        });
        expect(transfer.status).toBe(201);
        const dashboard = await request(app.server).get('/dashboard/recent').set(authHeader);
        expect(dashboard.status).toBe(200);
        expect(dashboard.body.totalBalance).toBe(500);
        const balanceMap = new Map(dashboard.body.balances.map((entry) => [
            entry.accountId,
            entry.balance,
        ]));
        expect(balanceMap.get(accountA.body.id)).toBe(300);
        expect(balanceMap.get(accountB.body.id)).toBe(200);
    });
    it('cannot transfer between accounts owned by different users', async () => {
        const owner = await registerUser('transfer-owner@example.com', 'Transfer Owner');
        const ownerHeader = { Authorization: `Bearer ${owner.accessToken}` };
        const otherUser = await registerUser('transfer-other@example.com', 'Transfer Other');
        const otherHeader = { Authorization: `Bearer ${otherUser.accessToken}` };
        const ownerAccount = await request(app.server).post('/accounts').set(ownerHeader).send({
            name: 'Owner Account',
            type: 'bank',
            currency: 'USD',
        });
        const otherAccount = await request(app.server).post('/accounts').set(otherHeader).send({
            name: 'Other Account',
            type: 'bank',
            currency: 'USD',
        });
        expect(ownerAccount.status).toBe(201);
        expect(otherAccount.status).toBe(201);
        const forbiddenTransfer = await request(app.server).post('/transfers').set(ownerHeader).send({
            fromAccountId: ownerAccount.body.id,
            toAccountId: otherAccount.body.id,
            amount: 50,
            occurredAt: '2026-09-10T12:00:00.000Z',
        });
        expect(forbiddenTransfer.status).toBe(404);
        expect(forbiddenTransfer.body.error.code).toBe('ACCOUNT_NOT_FOUND');
    });
    it('weekly recurring rule generates one transaction and advances nextRunAt', async () => {
        const session = await registerUser('recurring-weekly@example.com', 'Recurring Weekly');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        const category = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Utilities',
            type: 'expense',
            color: '#3344AA',
            icon: 'bolt',
        });
        expect(account.status).toBe(201);
        expect(category.status).toBe(201);
        const createRule = await request(app.server).post('/recurring').set(authHeader).send({
            kind: 'normal',
            accountId: account.body.id,
            categoryId: category.body.id,
            type: 'expense',
            amount: 25,
            description: 'Weekly utility',
            cadence: 'weekly',
            dayOfWeek: 1,
            startAt: new Date().toISOString(),
        });
        expect(createRule.status).toBe(201);
        const ruleId = createRule.body.id;
        const dueAt = new Date(Date.now() - 60 * 1000);
        await RecurringRuleModel.updateOne({ _id: ruleId }, {
            $set: {
                nextRunAt: dueAt,
                lastRunAt: null,
                isPaused: false,
            },
        });
        const runDue = await request(app.server)
            .post('/recurring/run-due')
            .set('x-cron-secret', 'test-cron-secret')
            .send({});
        expect(runDue.status).toBe(200);
        expect(runDue.body.processedRuns).toBe(1);
        expect(runDue.body.generatedTransactions).toBe(1);
        const rule = await RecurringRuleModel.findById(ruleId);
        expect(rule).toBeTruthy();
        expect(rule?.lastRunAt?.toISOString()).toBe(dueAt.toISOString());
        expect(rule?.nextRunAt.toISOString()).toBe(new Date(dueAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString());
        const generatedTransactions = await request(app.server)
            .get('/transactions')
            .set(authHeader)
            .query({ kind: 'normal' });
        expect(generatedTransactions.status).toBe(200);
        expect(generatedTransactions.body.transactions).toHaveLength(1);
    });
    it('monthly recurring rule generates one transaction and advances to next month', async () => {
        const session = await registerUser('recurring-monthly@example.com', 'Recurring Monthly');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        const category = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Subscription',
            type: 'expense',
            color: '#AA8844',
            icon: 'card',
        });
        expect(account.status).toBe(201);
        expect(category.status).toBe(201);
        const createRule = await request(app.server).post('/recurring').set(authHeader).send({
            kind: 'normal',
            accountId: account.body.id,
            categoryId: category.body.id,
            type: 'expense',
            amount: 15,
            description: 'Monthly plan',
            cadence: 'monthly',
            dayOfMonth: 1,
            startAt: new Date().toISOString(),
        });
        expect(createRule.status).toBe(201);
        const ruleId = createRule.body.id;
        const now = new Date();
        const dueAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, now.getUTCHours(), now.getUTCMinutes(), 0, 0));
        await RecurringRuleModel.updateOne({ _id: ruleId }, {
            $set: {
                nextRunAt: dueAt,
                lastRunAt: null,
                isPaused: false,
            },
        });
        const runDue = await request(app.server)
            .post('/recurring/run-due')
            .set('x-cron-secret', 'test-cron-secret')
            .send({});
        expect(runDue.status).toBe(200);
        expect(runDue.body.processedRuns).toBe(1);
        expect(runDue.body.generatedTransactions).toBe(1);
        const expectedNextRun = new Date(Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth() + 1, 1, dueAt.getUTCHours(), dueAt.getUTCMinutes(), dueAt.getUTCSeconds(), dueAt.getUTCMilliseconds()));
        const rule = await RecurringRuleModel.findById(ruleId);
        expect(rule).toBeTruthy();
        expect(rule?.lastRunAt?.toISOString()).toBe(dueAt.toISOString());
        expect(rule?.nextRunAt.toISOString()).toBe(expectedNextRun.toISOString());
    });
    it('transfer recurring rule generates paired transactions', async () => {
        const session = await registerUser('recurring-transfer@example.com', 'Recurring Transfer');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const [fromAccount, toAccount] = await Promise.all([
            request(app.server).post('/accounts').set(authHeader).send({
                name: 'Bank',
                type: 'bank',
                currency: 'USD',
            }),
            request(app.server).post('/accounts').set(authHeader).send({
                name: 'Cash',
                type: 'cash',
                currency: 'USD',
            }),
        ]);
        expect(fromAccount.status).toBe(201);
        expect(toAccount.status).toBe(201);
        const createRule = await request(app.server).post('/recurring').set(authHeader).send({
            kind: 'transfer',
            fromAccountId: fromAccount.body.id,
            toAccountId: toAccount.body.id,
            amount: 40,
            description: 'Weekly transfer',
            cadence: 'weekly',
            dayOfWeek: 2,
            startAt: new Date().toISOString(),
        });
        expect(createRule.status).toBe(201);
        const ruleId = createRule.body.id;
        const dueAt = new Date(Date.now() - 60 * 1000);
        await RecurringRuleModel.updateOne({ _id: ruleId }, {
            $set: {
                nextRunAt: dueAt,
                lastRunAt: null,
                isPaused: false,
            },
        });
        const runDue = await request(app.server)
            .post('/recurring/run-due')
            .set('x-cron-secret', 'test-cron-secret')
            .send({});
        expect(runDue.status).toBe(200);
        expect(runDue.body.processedRuns).toBe(1);
        expect(runDue.body.generatedTransactions).toBe(2);
        const transfers = await request(app.server)
            .get('/transactions')
            .set(authHeader)
            .query({ kind: 'transfer' });
        expect(transfers.status).toBe(200);
        expect(transfers.body.transactions).toHaveLength(2);
    });
    it('paused and soft-deleted recurring rules are not executed', async () => {
        const session = await registerUser('recurring-paused@example.com', 'Recurring Paused');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const account = await request(app.server).post('/accounts').set(authHeader).send({
            name: 'Main',
            type: 'bank',
            currency: 'USD',
        });
        const category = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Bills',
            type: 'expense',
            color: '#7733AA',
            icon: 'receipt',
        });
        expect(account.status).toBe(201);
        expect(category.status).toBe(201);
        const pausedRule = await request(app.server).post('/recurring').set(authHeader).send({
            kind: 'normal',
            accountId: account.body.id,
            categoryId: category.body.id,
            type: 'expense',
            amount: 20,
            cadence: 'weekly',
            dayOfWeek: 3,
            startAt: new Date().toISOString(),
        });
        const deletedRule = await request(app.server).post('/recurring').set(authHeader).send({
            kind: 'normal',
            accountId: account.body.id,
            categoryId: category.body.id,
            type: 'expense',
            amount: 30,
            cadence: 'weekly',
            dayOfWeek: 4,
            startAt: new Date().toISOString(),
        });
        expect(pausedRule.status).toBe(201);
        expect(deletedRule.status).toBe(201);
        const dueAt = new Date(Date.now() - 60 * 1000);
        await RecurringRuleModel.updateOne({ _id: pausedRule.body.id }, {
            $set: {
                nextRunAt: dueAt,
                isPaused: true,
            },
        });
        await RecurringRuleModel.updateOne({ _id: deletedRule.body.id }, {
            $set: {
                nextRunAt: dueAt,
                deletedAt: new Date(),
                isPaused: false,
            },
        });
        const runDue = await request(app.server)
            .post('/recurring/run-due')
            .set('x-cron-secret', 'test-cron-secret')
            .send({});
        expect(runDue.status).toBe(200);
        expect(runDue.body.processedRules).toBe(0);
        expect(runDue.body.processedRuns).toBe(0);
        expect(runDue.body.generatedTransactions).toBe(0);
        const txCount = await TransactionModel.countDocuments({});
        expect(txCount).toBe(0);
    });
    it('exports transactions csv with expected headers and rows', async () => {
        const session = await registerUser('export-csv@example.com', 'CSV Export');
        const authHeader = { Authorization: `Bearer ${session.accessToken}` };
        const [bank, wallet] = await Promise.all([
            request(app.server).post('/accounts').set(authHeader).send({
                name: 'Bank',
                type: 'bank',
                currency: 'USD',
            }),
            request(app.server).post('/accounts').set(authHeader).send({
                name: 'Wallet',
                type: 'cash',
                currency: 'USD',
            }),
        ]);
        expect(bank.status).toBe(201);
        expect(wallet.status).toBe(201);
        const expenseCategory = await request(app.server).post('/categories').set(authHeader).send({
            name: 'Groceries',
            type: 'expense',
            color: '#22AA66',
            icon: 'cart',
        });
        expect(expenseCategory.status).toBe(201);
        const normalTx = await request(app.server).post('/transactions').set(authHeader).send({
            accountId: bank.body.id,
            categoryId: expenseCategory.body.id,
            type: 'expense',
            amount: 35,
            currency: 'USD',
            description: 'Grocery run',
            occurredAt: '2026-09-10T08:00:00.000Z',
        });
        expect(normalTx.status).toBe(201);
        const transfer = await request(app.server).post('/transfers').set(authHeader).send({
            fromAccountId: bank.body.id,
            toAccountId: wallet.body.id,
            amount: 20,
            occurredAt: '2026-09-10T09:00:00.000Z',
            description: 'Cash move',
        });
        expect(transfer.status).toBe(201);
        const csvResponse = await request(app.server)
            .get('/export/transactions.csv')
            .set(authHeader)
            .query({
            from: '2026-09-01T00:00:00.000Z',
            to: '2026-09-30T23:59:59.000Z',
        });
        expect(csvResponse.status).toBe(200);
        expect(csvResponse.headers['content-type']).toContain('text/csv');
        const lines = csvResponse.text.trim().split('\n');
        expect(lines[0]).toBe('occurredAt,type,kind,accountName,categoryName,amount,currency,description');
        expect(lines.length).toBeGreaterThan(1);
        expect(csvResponse.text).toContain(',normal,');
        expect(csvResponse.text).toContain(',transfer,');
    });
});
