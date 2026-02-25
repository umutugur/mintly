import {
  aiAdviceQuerySchema,
  aiInsightsQuerySchema,
  aiReceiptParseInputSchema,
  aiAdviceResponseSchema,
  type AiAdviceQuery,
  type AiInsightsQuery,
  type AiReceiptParseInput,
  type AiAdviceResponse,
} from '@mintly/shared';
import type { FastifyInstance } from 'fastify';
import type { Types } from 'mongoose';

import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { generateAiInsights } from '../lib/ai-insights.js';
import { parseReceiptWithAiAssist } from '../lib/receipt-ai-assist.js';
import { getMonthBoundaries } from '../lib/month.js';
import { BudgetModel } from '../models/Budget.js';
import { CategoryModel } from '../models/Category.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const AI_INSIGHTS_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AI_INSIGHTS_RATE_LIMIT_MAX = 8;
const AI_RECEIPT_PARSE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AI_RECEIPT_PARSE_RATE_LIMIT_MAX = 12;

interface UserRateLimitEntry {
  count: number;
  resetAt: number;
}

const aiInsightsRateLimitByUser = new Map<string, UserRateLimitEntry>();
const aiReceiptParseRateLimitByUser = new Map<string, UserRateLimitEntry>();

function clampToPositive(value: number): number {
  return value < 0 ? 0 : value;
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

async function getUserBaseCurrency(userId: Types.ObjectId): Promise<string | null> {
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

function toDateOnlyUtc(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateOnlyUtc(value: string, field: 'from' | 'to'): Date {
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  if (
    parts.length !== 3 ||
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: `Invalid ${field} date`,
      statusCode: 400,
    });
  }

  return date;
}

function resolveInsightsDateRange(query: AiInsightsQuery): {
  from: Date;
  to: Date;
  fromLabel: string;
  toLabel: string;
} {
  const today = new Date();
  const defaultTo = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0),
  );
  const defaultFrom = new Date(defaultTo.getTime() - 89 * DAY_MS);

  const to = query.to ? parseDateOnlyUtc(query.to, 'to') : defaultTo;
  const from = query.from ? parseDateOnlyUtc(query.from, 'from') : defaultFrom;

  if (from.getTime() > to.getTime()) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: '`from` must be less than or equal to `to`',
      statusCode: 400,
    });
  }

  const daySpan = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (daySpan > 366) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: 'Requested date range is too large',
      statusCode: 400,
    });
  }

  return {
    from,
    to,
    fromLabel: toDateOnlyUtc(from),
    toLabel: toDateOnlyUtc(to),
  };
}

function enforceAiInsightsRateLimit(userId: string): void {
  const now = Date.now();
  const existing = aiInsightsRateLimitByUser.get(userId);

  if (!existing || existing.resetAt <= now) {
    aiInsightsRateLimitByUser.set(userId, {
      count: 1,
      resetAt: now + AI_INSIGHTS_RATE_LIMIT_WINDOW_MS,
    });
  } else if (existing.count >= AI_INSIGHTS_RATE_LIMIT_MAX) {
    throw new ApiError({
      code: 'RATE_LIMITED',
      message: 'Too many AI insight requests. Please retry in a minute.',
      statusCode: 429,
    });
  } else {
    existing.count += 1;
  }

  if (aiInsightsRateLimitByUser.size > 500) {
    for (const [key, entry] of aiInsightsRateLimitByUser.entries()) {
      if (entry.resetAt <= now) {
        aiInsightsRateLimitByUser.delete(key);
      }
    }
  }
}

function enforceAiReceiptParseRateLimit(userId: string): void {
  const now = Date.now();
  const existing = aiReceiptParseRateLimitByUser.get(userId);

  if (!existing || existing.resetAt <= now) {
    aiReceiptParseRateLimitByUser.set(userId, {
      count: 1,
      resetAt: now + AI_RECEIPT_PARSE_RATE_LIMIT_WINDOW_MS,
    });
  } else if (existing.count >= AI_RECEIPT_PARSE_RATE_LIMIT_MAX) {
    throw new ApiError({
      code: 'RATE_LIMITED',
      message: 'Too many receipt parse requests. Please retry in a minute.',
      statusCode: 429,
    });
  } else {
    existing.count += 1;
  }

  if (aiReceiptParseRateLimitByUser.size > 500) {
    for (const [key, entry] of aiReceiptParseRateLimitByUser.entries()) {
      if (entry.resetAt <= now) {
        aiReceiptParseRateLimitByUser.delete(key);
      }
    }
  }
}

export function registerAiRoutes(app: FastifyInstance): void {
  app.get('/ai/advice', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const query = parseQuery<AiAdviceQuery>(aiAdviceQuerySchema, request.query);
    const { start, endExclusive } = getMonthBoundaries(query.month, 'month');

    const [currency, transactions, budgets] = await Promise.all([
      getUserBaseCurrency(userId),
      TransactionModel.find({
        userId,
        deletedAt: null,
        kind: 'normal',
        occurredAt: {
          $gte: start,
          $lt: endExclusive,
        },
      }).select('type amount categoryId'),
      BudgetModel.find({
        userId,
        month: query.month,
        deletedAt: null,
      }).select('_id categoryId limitAmount'),
    ]);

    let totalIncome = 0;
    let totalExpense = 0;

    const expenseByCategoryId = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.type === 'income') {
        totalIncome += transaction.amount;
        continue;
      }

      totalExpense += transaction.amount;
      const categoryId = transaction.categoryId?.toString();
      if (!categoryId) {
        continue;
      }
      expenseByCategoryId.set(
        categoryId,
        (expenseByCategoryId.get(categoryId) ?? 0) + transaction.amount,
      );
    }

    const categoryIds = new Set<string>();
    for (const categoryId of expenseByCategoryId.keys()) {
      categoryIds.add(categoryId);
    }
    for (const budget of budgets) {
      categoryIds.add(budget.categoryId.toString());
    }

    const categories = categoryIds.size
      ? await CategoryModel.find({
          _id: { $in: Array.from(categoryIds).map((id) => parseObjectId(id, 'categoryId')) },
          deletedAt: null,
          $or: [{ userId }, { userId: null }],
        }).select('_id name')
      : [];

    const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

    let topExpenseCategory: AiAdviceResponse['topExpenseCategory'] = null;
    for (const [categoryId, total] of expenseByCategoryId.entries()) {
      if (!topExpenseCategory || total > topExpenseCategory.total) {
        topExpenseCategory = {
          categoryId,
          name: categoryNameById.get(categoryId) ?? 'Unknown',
          total: roundCurrency(total),
        };
      }
    }

    const budgetOverruns: AiAdviceResponse['budgetOverruns'] = [];
    for (const budget of budgets) {
      const categoryId = budget.categoryId.toString();
      const spentAmount = expenseByCategoryId.get(categoryId) ?? 0;
      if (spentAmount <= budget.limitAmount) {
        continue;
      }

      const overAmount = spentAmount - budget.limitAmount;
      budgetOverruns.push({
        budgetId: budget.id,
        categoryId,
        categoryName: categoryNameById.get(categoryId) ?? 'Unknown',
        limitAmount: roundCurrency(budget.limitAmount),
        spentAmount: roundCurrency(spentAmount),
        overAmount: roundCurrency(overAmount),
      });
    }
budgetOverruns.sort(
  (a: (typeof budgetOverruns)[number], b: (typeof budgetOverruns)[number]) =>
    b.overAmount - a.overAmount,
);
    const net = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? net / totalIncome : 0;

    const advice: AiAdviceResponse['advice'] = [];
    const nextActions: string[] = [];

    if (totalIncome === 0 && totalExpense === 0) {
      advice.push({
        title: 'Start tracking',
        message: 'No transactions detected this month. Add your first income or expense to unlock insights.',
        severity: 'info',
      });
      nextActions.push('Add at least three transactions this week for personalized insights.');
    } else {
      if (net < 0) {
        advice.push({
          title: 'Spending exceeds income',
          message: 'Your net is negative for this month. Reduce variable expenses to restore positive cash flow.',
          severity: 'warning',
        });
        nextActions.push('Set a weekly expense cap for discretionary spending.');
      } else if (savingsRate >= 0.2) {
        advice.push({
          title: 'Healthy savings pace',
          message: 'You are saving at least 20% of monthly income. Keep this pace to improve resilience.',
          severity: 'success',
        });
      } else {
        advice.push({
          title: 'Moderate savings rate',
          message: 'Your net is positive but savings rate is limited. Small cuts in top categories can improve it.',
          severity: 'info',
        });
      }

      if (topExpenseCategory && totalExpense > 0) {
        const topShare = topExpenseCategory.total / totalExpense;
        if (topShare >= 0.4) {
          advice.push({
            title: 'Expense concentration detected',
            message: `${topExpenseCategory.name} drives ${Math.round(topShare * 100)}% of your expenses this month.`,
            severity: 'warning',
          });
          nextActions.push(`Review ${topExpenseCategory.name} costs and reduce by 10% next month.`);
        } else {
          advice.push({
            title: 'Balanced category mix',
            message: 'No single category dominates your expenses. Keep monitoring recurring costs.',
            severity: 'success',
          });
        }
      }

      if (budgetOverruns.length > 0) {
        for (const overrun of budgetOverruns.slice(0, 2)) {
          advice.push({
            title: `Budget overrun: ${overrun.categoryName}`,
            message: `You are over budget by ${roundCurrency(overrun.overAmount)} ${currency ?? ''}`.trim(),
            severity: 'warning',
          });
          nextActions.push(`Pause non-essential ${overrun.categoryName} expenses until month-end.`);
        }
      } else {
        advice.push({
          title: 'Budgets on track',
          message: 'No budget overruns detected for this month.',
          severity: 'success',
        });
        nextActions.push('Keep current budget limits and review them at month-end.');
      }
    }

    if (nextActions.length === 0) {
      nextActions.push('Review your dashboard once a week to stay on track.');
    }

    return aiAdviceResponseSchema.parse({
      month: query.month,
      currency,
      totalIncome: roundCurrency(clampToPositive(totalIncome)),
      totalExpense: roundCurrency(clampToPositive(totalExpense)),
      net: roundCurrency(net),
      topExpenseCategory,
      budgetOverruns,
      advice,
      nextActions,
    });
  });

  app.get('/ai/insights', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    enforceAiInsightsRateLimit(user.id);

    const userId = parseObjectId(user.id, 'userId');
    const query = parseQuery<AiInsightsQuery>(aiInsightsQuerySchema, request.query);
    const dateRange = resolveInsightsDateRange(query);

    return generateAiInsights({
      userId,
      from: dateRange.from,
      to: dateRange.to,
      fromLabel: dateRange.fromLabel,
      toLabel: dateRange.toLabel,
      language: query.language,
    });
  });

  app.post('/ai/receipt-parse', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    enforceAiReceiptParseRateLimit(user.id);

    const input = parseBody<AiReceiptParseInput>(aiReceiptParseInputSchema, request.body);
    return parseReceiptWithAiAssist({
      userId: user.id,
      rawText: input.rawText,
      locale: input.locale,
      currencyHint: input.currencyHint ?? null,
    });
  });
}
