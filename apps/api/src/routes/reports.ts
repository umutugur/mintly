import {
  weeklyReportQuerySchema,
  weeklyReportResponseSchema,
  type WeeklyReportQuery,
} from '@finsight/shared';
import type { FastifyInstance } from 'fastify';

import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { getMonthBoundaries } from '../lib/month.js';
import { BudgetModel } from '../models/Budget.js';
import { CategoryModel } from '../models/Category.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

import { parseObjectId, parseQuery, requireUser } from './utils.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnlyUtc(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toMonthString(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseDateOnlyUtc(value: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid weekStart date',
      statusCode: 400,
    });
  }

  return date;
}

function getCurrentWeekStartUtc(now = new Date()): Date {
  const weekday = now.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function registerReportRoutes(app: FastifyInstance): void {
  app.get('/reports/weekly', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const query = parseQuery<WeeklyReportQuery>(weeklyReportQuerySchema, request.query);

    const weekStart = query.weekStart ? parseDateOnlyUtc(query.weekStart) : getCurrentWeekStartUtc();
    const weekEndExclusive = new Date(weekStart.getTime() + 7 * DAY_MS);
    const weekEndInclusive = new Date(weekEndExclusive.getTime() - DAY_MS);
    const month = toMonthString(weekStart);
    const { start: monthStart, endExclusive: monthEndExclusive } = getMonthBoundaries(month, 'month');

    const [userDoc, weeklyTransactions, monthlyBudgets, monthExpenseRows] = await Promise.all([
      UserModel.findById(userId).select('baseCurrency'),
      TransactionModel.find({
        userId,
        deletedAt: null,
        kind: 'normal',
        occurredAt: {
          $gte: weekStart,
          $lt: weekEndExclusive,
        },
      }).select('type amount categoryId'),
      BudgetModel.find({
        userId,
        month,
        deletedAt: null,
      }).select('_id categoryId limitAmount'),
      TransactionModel.aggregate<{
        _id: string;
        spentAmount: number;
      }>([
        {
          $match: {
            userId,
            deletedAt: null,
            kind: 'normal',
            type: 'expense',
            occurredAt: {
              $gte: monthStart,
              $lt: monthEndExclusive,
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

    if (!userDoc) {
      throw new ApiError({
        code: 'UNAUTHORIZED',
        message: 'User not found',
        statusCode: 401,
      });
    }

    let totalIncome = 0;
    let totalExpense = 0;
    const weeklyExpenseByCategoryId = new Map<string, number>();
    for (const transaction of weeklyTransactions) {
      if (transaction.type === 'income') {
        totalIncome += transaction.amount;
        continue;
      }

      totalExpense += transaction.amount;
      const categoryId = transaction.categoryId?.toString();
      if (!categoryId) {
        continue;
      }

      weeklyExpenseByCategoryId.set(
        categoryId,
        (weeklyExpenseByCategoryId.get(categoryId) ?? 0) + transaction.amount,
      );
    }

    const spentByMonthCategoryId = new Map(
      monthExpenseRows.map((row) => [String(row._id), row.spentAmount]),
    );

    const budgetCategoryIds = monthlyBudgets.map((budget) => budget.categoryId.toString());
    const expenseCategoryIds = Array.from(weeklyExpenseByCategoryId.keys());
    const categoryIds = Array.from(new Set([...budgetCategoryIds, ...expenseCategoryIds]));

    const categories = categoryIds.length
      ? await CategoryModel.find({
          _id: { $in: categoryIds.map((id) => parseObjectId(id, 'categoryId')) },
          deletedAt: null,
          $or: [{ userId }, { userId: null }],
        }).select('_id name')
      : [];
    const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

    let topExpenseCategoryId: string | null = null;
    let topExpenseAmount = 0;
    for (const [categoryId, amount] of weeklyExpenseByCategoryId.entries()) {
      if (amount > topExpenseAmount) {
        topExpenseAmount = amount;
        topExpenseCategoryId = categoryId;
      }
    }

    const budgetOverruns = monthlyBudgets
      .map((budget) => {
        const categoryId = budget.categoryId.toString();
        const spentAmount = spentByMonthCategoryId.get(categoryId) ?? 0;
        const overAmount = spentAmount - budget.limitAmount;

        return {
          categoryId,
          categoryName: categoryNameById.get(categoryId) ?? 'Unknown',
          overAmount,
        };
      })
      .filter((entry) => entry.overAmount > 0)
      .sort((a, b) => b.overAmount - a.overAmount);

    const net = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? net / totalIncome : 0;
    const expenseIncomeRatio = totalIncome > 0 ? totalExpense / totalIncome : totalExpense > 0 ? 999 : 0;

    let score = 100;
    score -= Math.min(36, budgetOverruns.length * 12);

    if (expenseIncomeRatio > 0.9) {
      score -= 15;
      if (expenseIncomeRatio > 1) {
        score -= 10;
      }
    }

    if (savingsRate >= 0.2) {
      score += 8;
    } else if (savingsRate >= 0.1) {
      score += 4;
    } else if (totalIncome > 0 && savingsRate < 0.05) {
      score -= 8;
    }

    if (net < 0) {
      score -= 12;
    }

    const healthScore = clampScore(score);

    let summaryText = 'Stable week. Keep monitoring spending patterns.';
    if (healthScore >= 80) {
      summaryText = 'Strong financial health this week with disciplined spending.';
    } else if (healthScore < 60) {
      summaryText = 'Financial pressure detected this week. Review budgets and reduce variable costs.';
    }

    const highlights: string[] = [
      `Income this week: ${Math.round(totalIncome * 100) / 100}`,
      `Expenses this week: ${Math.round(totalExpense * 100) / 100}`,
      `Net this week: ${Math.round(net * 100) / 100}`,
    ];

    if (topExpenseCategoryId) {
      highlights.push(
        `Top expense category: ${categoryNameById.get(topExpenseCategoryId) ?? 'Unknown'} (${Math.round(topExpenseAmount * 100) / 100})`,
      );
    }

    const riskFlags: string[] = [];
    if (expenseIncomeRatio > 0.9) {
      riskFlags.push('Expense to income ratio is above 90%.');
    }
    if (net < 0) {
      riskFlags.push('Weekly net is negative.');
    }
    for (const overrun of budgetOverruns.slice(0, 3)) {
      riskFlags.push(`Budget overrun in ${overrun.categoryName}.`);
    }

    if (riskFlags.length === 0) {
      riskFlags.push('No major risk signals detected for this week.');
    }

    let nextWeekForecastText =
      'Maintain current routine and review your dashboard mid-week for adjustments.';
    if (healthScore >= 80) {
      nextWeekForecastText =
        'If this trend continues, next week should stay within budget with room to save more.';
    } else if (healthScore < 60) {
      nextWeekForecastText =
        'Without spending adjustments, next week may increase budget pressure. Prioritize fixed essentials first.';
    }

    return weeklyReportResponseSchema.parse({
      weekStart: toDateOnlyUtc(weekStart),
      weekEnd: toDateOnlyUtc(weekEndInclusive),
      currency: userDoc.baseCurrency ?? null,
      healthScore,
      summaryText,
      highlights,
      riskFlags,
      nextWeekForecastText,
    });
  });
}

