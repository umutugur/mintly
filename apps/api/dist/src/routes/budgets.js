import { budgetCreateInputSchema, budgetListQuerySchema, budgetListResponseSchema, budgetSchema, budgetUpdateInputSchema, logoutResponseSchema, } from '@finsight/shared';
import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { getMonthBoundaries } from '../lib/month.js';
import { BudgetModel } from '../models/Budget.js';
import { CategoryModel } from '../models/Category.js';
import { TransactionModel } from '../models/Transaction.js';
import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';
function toBudgetDto(budget) {
    const stamped = budget;
    return {
        id: budget.id,
        categoryId: budget.categoryId.toString(),
        month: budget.month,
        limitAmount: budget.limitAmount,
        createdAt: stamped.createdAt.toISOString(),
        updatedAt: stamped.updatedAt.toISOString(),
    };
}
async function validateExpenseCategory(userId, categoryId) {
    const category = await CategoryModel.findOne({
        _id: categoryId,
        type: 'expense',
        deletedAt: null,
        $or: [{ userId }, { userId: null }],
    });
    if (!category) {
        throw new ApiError({
            code: 'INVALID_BUDGET_CATEGORY',
            message: 'Category must be an expense category',
            statusCode: 400,
        });
    }
    return category;
}
export function registerBudgetRoutes(app) {
    app.get('/budgets', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const query = parseQuery(budgetListQuerySchema, request.query);
        const { start, endExclusive } = getMonthBoundaries(query.month, 'month');
        const budgets = await BudgetModel.find({
            userId,
            month: query.month,
            ...(query.includeDeleted ? {} : { deletedAt: null }),
        }).sort({ createdAt: -1 });
        if (budgets.length === 0) {
            return budgetListResponseSchema.parse({ budgets: [] });
        }
        const activeBudgets = budgets.filter((budget) => budget.deletedAt === null);
        if (activeBudgets.length === 0) {
            return budgetListResponseSchema.parse({ budgets: [] });
        }
        const categoryIds = activeBudgets.map((budget) => budget.categoryId);
        const [categories, spentRows] = await Promise.all([
            CategoryModel.find({
                _id: { $in: categoryIds },
                deletedAt: null,
                $or: [{ userId }, { userId: null }],
            }).select('_id name'),
            TransactionModel.aggregate([
                {
                    $match: {
                        userId,
                        deletedAt: null,
                        kind: 'normal',
                        type: 'expense',
                        categoryId: { $in: categoryIds },
                        occurredAt: {
                            $gte: start,
                            $lt: endExclusive,
                        },
                    },
                },
                {
                    $group: {
                        _id: '$categoryId',
                        spentAmount: { $sum: '$amount' },
                    },
                },
            ]),
        ]);
        const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
        const spentAmountByCategoryId = new Map(spentRows.map((row) => [row._id.toString(), row.spentAmount]));
        return budgetListResponseSchema.parse({
            budgets: activeBudgets.map((budget) => {
                const categoryId = budget.categoryId.toString();
                const spentAmount = spentAmountByCategoryId.get(categoryId) ?? 0;
                const remainingAmount = budget.limitAmount - spentAmount;
                const percentUsed = budget.limitAmount > 0 ? (spentAmount / budget.limitAmount) * 100 : 0;
                return {
                    id: budget.id,
                    categoryId,
                    categoryName: categoryNameById.get(categoryId) ?? 'Unknown',
                    month: budget.month,
                    limitAmount: budget.limitAmount,
                    spentAmount,
                    remainingAmount,
                    percentUsed,
                };
            }),
        });
    });
    app.post('/budgets', { preHandler: authenticate }, async (request, reply) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const input = parseBody(budgetCreateInputSchema, request.body);
        const categoryId = parseObjectId(input.categoryId, 'categoryId');
        await validateExpenseCategory(userId, categoryId);
        try {
            const budget = await BudgetModel.create({
                userId,
                categoryId,
                month: input.month,
                limitAmount: input.limitAmount,
                deletedAt: null,
            });
            reply.status(201);
            return budgetSchema.parse(toBudgetDto(budget));
        }
        catch (error) {
            if (error.code === 11000) {
                throw new ApiError({
                    code: 'BUDGET_ALREADY_EXISTS',
                    message: 'Budget already exists for this category and month',
                    statusCode: 409,
                });
            }
            throw error;
        }
    });
    app.patch('/budgets/:id', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const budgetId = parseObjectId(request.params.id ?? '', 'id');
        const input = parseBody(budgetUpdateInputSchema, request.body);
        const budget = await BudgetModel.findOne({ _id: budgetId, userId, deletedAt: null });
        if (!budget) {
            throw new ApiError({
                code: 'BUDGET_NOT_FOUND',
                message: 'Budget not found',
                statusCode: 404,
            });
        }
        budget.limitAmount = input.limitAmount;
        await budget.save();
        return budgetSchema.parse(toBudgetDto(budget));
    });
    app.delete('/budgets/:id', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const budgetId = parseObjectId(request.params.id ?? '', 'id');
        const budget = await BudgetModel.findOne({
            _id: budgetId,
            userId,
            deletedAt: null,
        });
        if (!budget) {
            throw new ApiError({
                code: 'BUDGET_NOT_FOUND',
                message: 'Budget not found',
                statusCode: 404,
            });
        }
        budget.deletedAt = new Date();
        await budget.save();
        return logoutResponseSchema.parse({ ok: true });
    });
}
