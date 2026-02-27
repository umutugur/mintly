import {
  weeklyReportQuerySchema,
  weeklyReportResponseSchema,
  type WeeklyReportQuery,
} from '@mintly/shared';
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
type WeeklyReportLanguage = 'tr' | 'en' | 'ru';

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

function toLocale(language: WeeklyReportLanguage): string {
  if (language === 'tr') return 'tr-TR';
  if (language === 'ru') return 'ru-RU';
  return 'en-US';
}

function formatAmount(value: number, currency: string | null | undefined, language: WeeklyReportLanguage): string {
  const rounded = Math.round(value * 100) / 100;
  const locale = toLocale(language);

  if (currency) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(rounded);
    } catch {
      // Fallback to plain numeric formatting below.
    }
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(rounded);
}

export function registerReportRoutes(app: FastifyInstance): void {
  app.get('/reports/weekly', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const query = parseQuery<WeeklyReportQuery>(weeklyReportQuerySchema, request.query);

    const weekStart = query.weekStart ? parseDateOnlyUtc(query.weekStart) : getCurrentWeekStartUtc();
    const language = (query.language ?? 'en') as WeeklyReportLanguage;
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

    const incomeText = formatAmount(totalIncome, userDoc.baseCurrency, language);
    const expenseText = formatAmount(totalExpense, userDoc.baseCurrency, language);
    const netText = formatAmount(net, userDoc.baseCurrency, language);
    const topExpenseText = formatAmount(topExpenseAmount, userDoc.baseCurrency, language);

    let summaryText = language === 'tr'
      ? 'Hafta genel olarak dengeli geçti. Harcama düzenini izlemeye devam et.'
      : language === 'ru'
        ? 'Неделя прошла в целом стабильно. Продолжайте контролировать структуру расходов.'
        : 'Stable week. Keep monitoring spending patterns.';
    if (healthScore >= 80) {
      summaryText = language === 'tr'
        ? 'Bu hafta finansal sağlık güçlü görünüyor; disiplinli harcama davranışı korunmuş.'
        : language === 'ru'
          ? 'На этой неделе финансовое состояние сильное: дисциплина расходов сохраняется.'
          : 'Strong financial health this week with disciplined spending.';
    } else if (healthScore < 60) {
      summaryText = language === 'tr'
        ? 'Bu hafta finansal baskı sinyali var. Bütçeyi gözden geçirip değişken giderleri azaltmak faydalı olur.'
        : language === 'ru'
          ? 'На этой неделе есть сигнал финансового давления. Стоит пересмотреть бюджет и сократить переменные расходы.'
          : 'Financial pressure detected this week. Review budgets and reduce variable costs.';
    }

    const highlights: string[] = language === 'tr'
      ? [
          `Bu hafta gelir: ${incomeText}`,
          `Bu hafta gider: ${expenseText}`,
          `Bu hafta net: ${netText}`,
        ]
      : language === 'ru'
        ? [
            `Доход за неделю: ${incomeText}`,
            `Расход за неделю: ${expenseText}`,
            `Чистый итог недели: ${netText}`,
          ]
        : [
            `Income this week: ${incomeText}`,
            `Expenses this week: ${expenseText}`,
            `Net this week: ${netText}`,
          ];

    if (topExpenseCategoryId) {
      const topCategoryName = categoryNameById.get(topExpenseCategoryId)
        ?? (language === 'tr' ? 'Bilinmeyen' : language === 'ru' ? 'Неизвестно' : 'Unknown');
      if (language === 'tr') {
        highlights.push(`En yüksek gider kategorisi: ${topCategoryName} (${topExpenseText})`);
      } else if (language === 'ru') {
        highlights.push(`Категория с максимальным расходом: ${topCategoryName} (${topExpenseText})`);
      } else {
        highlights.push(`Top expense category: ${topCategoryName} (${topExpenseText})`);
      }
    }

    const riskFlags: string[] = [];
    if (expenseIncomeRatio > 0.9) {
      riskFlags.push(
        language === 'tr'
          ? 'Gider/gelir oranı %90 üzerinde.'
          : language === 'ru'
            ? 'Соотношение расходов к доходам выше 90%.'
            : 'Expense to income ratio is above 90%.',
      );
    }
    if (net < 0) {
      riskFlags.push(
        language === 'tr'
          ? 'Haftalık net sonuç negatif.'
          : language === 'ru'
            ? 'Недельный чистый результат отрицательный.'
            : 'Weekly net is negative.',
      );
    }
    for (const overrun of budgetOverruns.slice(0, 3)) {
      riskFlags.push(
        language === 'tr'
          ? `${overrun.categoryName} kategorisinde bütçe aşımı var.`
          : language === 'ru'
            ? `В категории ${overrun.categoryName} есть превышение бюджета.`
            : `Budget overrun in ${overrun.categoryName}.`,
      );
    }

    if (riskFlags.length === 0) {
      riskFlags.push(
        language === 'tr'
          ? 'Bu hafta için belirgin risk sinyali tespit edilmedi.'
          : language === 'ru'
            ? 'На этой неделе существенных риск-сигналов не обнаружено.'
            : 'No major risk signals detected for this week.',
      );
    }

    let nextWeekForecastText = language === 'tr'
      ? 'Mevcut rutini koruyup hafta ortasında gösterge panelini kontrol ederek küçük ayarlar yap.'
      : language === 'ru'
        ? 'Сохраняйте текущий ритм и сделайте короткую проверку панели в середине недели для корректировок.'
        : 'Maintain current routine and review your dashboard mid-week for adjustments.';
    if (healthScore >= 80) {
      nextWeekForecastText = language === 'tr'
        ? 'Bu trend sürerse gelecek hafta bütçe içinde kalırken birikim alanı da artabilir.'
        : language === 'ru'
          ? 'Если тренд сохранится, на следующей неделе бюджет останется под контролем и появится пространство для накоплений.'
          : 'If this trend continues, next week should stay within budget with room to save more.';
    } else if (healthScore < 60) {
      nextWeekForecastText = language === 'tr'
        ? 'Harcama ayarı yapılmazsa gelecek hafta bütçe baskısı artabilir. Önce sabit ve zorunlu kalemleri önceliklendir.'
        : language === 'ru'
          ? 'Без корректировки расходов давление на бюджет на следующей неделе может усилиться. Сначала приоритизируйте обязательные фиксированные платежи.'
          : 'Without spending adjustments, next week may increase budget pressure. Prioritize fixed essentials first.';
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
