import { analyticsByCategoryQuerySchema, analyticsByCategoryResponseSchema, analyticsSummaryQuerySchema, analyticsSummaryResponseSchema, analyticsTrendQuerySchema, analyticsTrendResponseSchema, } from '@finsight/shared';
import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { getMonthBoundaries, enumerateMonths } from '../lib/month.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';
import { parseObjectId, parseQuery, requireUser } from './utils.js';
async function getUserBaseCurrency(userId) {
    const user = await UserModel.findById(userId).select('baseCurrency');
    if (!user) {
        throw new ApiError({
            code: 'UNAUTHORIZED',
            message: 'User not found',
            statusCode: 401,
        });
    }
    return user.baseCurrency ?? null;
}
export function registerAnalyticsRoutes(app) {
    app.get('/analytics/summary', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const query = parseQuery(analyticsSummaryQuerySchema, request.query);
        const { start, endExclusive } = getMonthBoundaries(query.month, 'month');
        const match = {
            userId,
            deletedAt: null,
            kind: 'normal',
            occurredAt: {
                $gte: start,
                $lt: endExclusive,
            },
        };
        const [currency, totalsRows, topRows] = await Promise.all([
            getUserBaseCurrency(userId),
            TransactionModel.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: null,
                        incomeTotal: {
                            $sum: {
                                $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0],
                            },
                        },
                        expenseTotal: {
                            $sum: {
                                $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0],
                            },
                        },
                        transactionCount: { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        incomeTotal: 1,
                        expenseTotal: 1,
                        transactionCount: 1,
                    },
                },
            ]),
            TransactionModel.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: {
                            categoryId: '$categoryId',
                            type: '$type',
                        },
                        total: { $sum: '$amount' },
                    },
                },
                { $sort: { total: -1 } },
                {
                    $lookup: {
                        from: 'categories',
                        localField: '_id.categoryId',
                        foreignField: '_id',
                        as: 'categoryDocs',
                    },
                },
                {
                    $unwind: {
                        path: '$categoryDocs',
                        preserveNullAndEmptyArrays: true,
                    },
                },
                {
                    $project: {
                        _id: 0,
                        categoryId: '$_id.categoryId',
                        type: '$_id.type',
                        total: 1,
                        name: { $ifNull: ['$categoryDocs.name', 'Unknown'] },
                    },
                },
            ]),
        ]);
        const totals = totalsRows[0] ?? {
            incomeTotal: 0,
            expenseTotal: 0,
            transactionCount: 0,
        };
        const topCategories = topRows.map((entry) => {
            const denominator = entry.type === 'expense' ? totals.expenseTotal : totals.incomeTotal;
            const percent = denominator > 0 ? (entry.total / denominator) * 100 : 0;
            return {
                categoryId: entry.categoryId.toString(),
                name: entry.name,
                type: entry.type,
                total: entry.total,
                percent,
            };
        });
        return analyticsSummaryResponseSchema.parse({
            month: query.month,
            currency,
            incomeTotal: totals.incomeTotal,
            expenseTotal: totals.expenseTotal,
            netTotal: totals.incomeTotal - totals.expenseTotal,
            transactionCount: totals.transactionCount,
            topCategories,
        });
    });
    app.get('/analytics/by-category', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const query = parseQuery(analyticsByCategoryQuerySchema, request.query);
        const { start, endExclusive } = getMonthBoundaries(query.month, 'month');
        const [currency, rows] = await Promise.all([
            getUserBaseCurrency(userId),
            TransactionModel.aggregate([
                {
                    $match: {
                        userId,
                        deletedAt: null,
                        kind: 'normal',
                        type: query.type,
                        occurredAt: {
                            $gte: start,
                            $lt: endExclusive,
                        },
                    },
                },
                {
                    $group: {
                        _id: '$categoryId',
                        total: { $sum: '$amount' },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { total: -1 } },
                {
                    $lookup: {
                        from: 'categories',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'categoryDocs',
                    },
                },
                {
                    $unwind: {
                        path: '$categoryDocs',
                        preserveNullAndEmptyArrays: true,
                    },
                },
                {
                    $project: {
                        _id: 0,
                        categoryId: '$_id',
                        name: { $ifNull: ['$categoryDocs.name', 'Unknown'] },
                        total: 1,
                        count: 1,
                    },
                },
            ]),
        ]);
        return analyticsByCategoryResponseSchema.parse({
            month: query.month,
            type: query.type,
            currency,
            categories: rows.map((row) => ({
                categoryId: row.categoryId.toString(),
                name: row.name,
                total: row.total,
                count: row.count,
            })),
        });
    });
    app.get('/analytics/trend', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const query = parseQuery(analyticsTrendQuerySchema, request.query);
        const months = enumerateMonths(query.from, query.to);
        const fromBoundary = getMonthBoundaries(query.from, 'from');
        const toBoundary = getMonthBoundaries(query.to, 'to');
        const [currency, rows] = await Promise.all([
            getUserBaseCurrency(userId),
            TransactionModel.aggregate([
                {
                    $match: {
                        userId,
                        deletedAt: null,
                        kind: 'normal',
                        occurredAt: {
                            $gte: fromBoundary.start,
                            $lt: toBoundary.endExclusive,
                        },
                    },
                },
                {
                    $project: {
                        month: {
                            $dateToString: {
                                format: '%Y-%m',
                                date: '$occurredAt',
                                timezone: 'UTC',
                            },
                        },
                        type: 1,
                        amount: 1,
                    },
                },
                {
                    $group: {
                        _id: '$month',
                        incomeTotal: {
                            $sum: {
                                $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0],
                            },
                        },
                        expenseTotal: {
                            $sum: {
                                $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0],
                            },
                        },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        month: '$_id',
                        incomeTotal: 1,
                        expenseTotal: 1,
                        netTotal: { $subtract: ['$incomeTotal', '$expenseTotal'] },
                    },
                },
                { $sort: { month: 1 } },
            ]),
        ]);
        const byMonth = new Map(rows.map((row) => [row.month, row]));
        return analyticsTrendResponseSchema.parse({
            currency,
            points: months.map((month) => {
                const row = byMonth.get(month);
                if (!row) {
                    return {
                        month,
                        incomeTotal: 0,
                        expenseTotal: 0,
                        netTotal: 0,
                    };
                }
                return row;
            }),
        });
    });
}
