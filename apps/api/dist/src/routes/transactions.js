import { logoutResponseSchema, transactionCreateInputSchema, transactionListQuerySchema, transactionListResponseSchema, transactionSchema, transactionUpdateInputSchema, } from '@finsight/shared';
import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { createNormalTransaction, resolveActiveAccount, resolveActiveCategory, validateCurrency, validateTransactionType, } from '../lib/ledger.js';
import { toTransactionDto } from '../lib/transaction-dto.js';
import { TransactionModel } from '../models/Transaction.js';
import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';
function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function registerTransactionRoutes(app) {
    app.get('/transactions', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const query = parseQuery(transactionListQuerySchema, request.query);
        const filter = { userId };
        if (!query.includeDeleted) {
            filter.deletedAt = null;
        }
        if (query.accountId) {
            filter.accountId = parseObjectId(query.accountId, 'accountId');
        }
        if (query.categoryId) {
            filter.categoryId = parseObjectId(query.categoryId, 'categoryId');
        }
        if (query.type) {
            filter.type = query.type;
        }
        if (query.kind) {
            filter.kind = query.kind;
        }
        if (query.currency) {
            filter.currency = query.currency;
        }
        if (query.from || query.to) {
            const occurredAtFilter = {};
            if (query.from) {
                occurredAtFilter.$gte = new Date(query.from);
            }
            if (query.to) {
                occurredAtFilter.$lte = new Date(query.to);
            }
            filter.occurredAt = occurredAtFilter;
        }
        if (query.search) {
            filter.description = { $regex: escapeRegex(query.search), $options: 'i' };
        }
        const skip = (query.page - 1) * query.limit;
        const [transactions, total] = await Promise.all([
            TransactionModel.find(filter).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(query.limit),
            TransactionModel.countDocuments(filter),
        ]);
        const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
        return transactionListResponseSchema.parse({
            transactions: transactions.map((transaction) => toTransactionDto(transaction)),
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages,
            },
        });
    });
    app.post('/transactions', { preHandler: authenticate }, async (request, reply) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const input = parseBody(transactionCreateInputSchema, request.body);
        const accountId = parseObjectId(input.accountId, 'accountId');
        const categoryId = parseObjectId(input.categoryId, 'categoryId');
        const [account, category] = await Promise.all([
            resolveActiveAccount(userId, accountId),
            resolveActiveCategory(userId, categoryId),
        ]);
        validateCurrency(account.currency, input.currency);
        validateTransactionType(category.type, input.type);
        const transaction = await createNormalTransaction({
            userId,
            accountId: account._id,
            categoryId: category._id,
            type: input.type,
            amount: input.amount,
            currency: input.currency,
            description: input.description ?? null,
            occurredAt: new Date(input.occurredAt),
        });
        reply.status(201);
        return transactionSchema.parse(toTransactionDto(transaction));
    });
    app.get('/transactions/:id', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const transactionId = parseObjectId(request.params.id ?? '', 'id');
        const transaction = await TransactionModel.findOne({
            _id: transactionId,
            userId,
            deletedAt: null,
        });
        if (!transaction) {
            throw new ApiError({
                code: 'TRANSACTION_NOT_FOUND',
                message: 'Transaction not found',
                statusCode: 404,
            });
        }
        return transactionSchema.parse(toTransactionDto(transaction));
    });
    app.patch('/transactions/:id', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const transactionId = parseObjectId(request.params.id ?? '', 'id');
        const input = parseBody(transactionUpdateInputSchema, request.body);
        const transaction = await TransactionModel.findOne({
            _id: transactionId,
            userId,
            deletedAt: null,
        });
        if (!transaction) {
            throw new ApiError({
                code: 'TRANSACTION_NOT_FOUND',
                message: 'Transaction not found',
                statusCode: 404,
            });
        }
        if (transaction.kind === 'transfer') {
            throw new ApiError({
                code: 'TRANSFER_TRANSACTION_READ_ONLY',
                message: 'Transfer transactions cannot be edited directly',
                statusCode: 400,
            });
        }
        const accountId = input.accountId !== undefined ? parseObjectId(input.accountId, 'accountId') : transaction.accountId;
        const categoryId = input.categoryId !== undefined
            ? parseObjectId(input.categoryId, 'categoryId')
            : transaction.categoryId;
        if (!categoryId) {
            throw new ApiError({
                code: 'CATEGORY_NOT_FOUND',
                message: 'Category not found',
                statusCode: 404,
            });
        }
        const [account, category] = await Promise.all([
            resolveActiveAccount(userId, accountId),
            resolveActiveCategory(userId, categoryId),
        ]);
        const nextType = input.type ?? transaction.type;
        const nextCurrency = input.currency ?? transaction.currency;
        validateCurrency(account.currency, nextCurrency);
        validateTransactionType(category.type, nextType);
        transaction.accountId = account._id;
        transaction.categoryId = category._id;
        transaction.type = nextType;
        if (input.amount !== undefined) {
            transaction.amount = input.amount;
        }
        transaction.currency = nextCurrency;
        if (input.description !== undefined) {
            transaction.description = input.description && input.description.length > 0 ? input.description : null;
        }
        if (input.occurredAt !== undefined) {
            transaction.occurredAt = new Date(input.occurredAt);
        }
        await transaction.save();
        return transactionSchema.parse(toTransactionDto(transaction));
    });
    app.delete('/transactions/:id', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const transactionId = parseObjectId(request.params.id ?? '', 'id');
        const transaction = await TransactionModel.findOne({
            _id: transactionId,
            userId,
            deletedAt: null,
        });
        if (!transaction) {
            throw new ApiError({
                code: 'TRANSACTION_NOT_FOUND',
                message: 'Transaction not found',
                statusCode: 404,
            });
        }
        transaction.deletedAt = new Date();
        await transaction.save();
        return logoutResponseSchema.parse({ ok: true });
    });
}
