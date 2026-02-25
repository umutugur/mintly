import { dashboardRecentResponseSchema, type DashboardRecentResponse } from '@mintly/shared';
import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';

import { authenticate } from '../auth/middleware.js';
import { toTransactionDto } from '../lib/transaction-dto.js';
import { AccountModel, type AccountDocument } from '../models/Account.js';
import { CategoryModel } from '../models/Category.js';
import { RecurringRuleModel, type RecurringRuleDocument } from '../models/RecurringRule.js';
import { TransactionModel } from '../models/Transaction.js';
import { UpcomingPaymentModel, type UpcomingPaymentDocument } from '../models/UpcomingPayment.js';

import { parseObjectId, requireUser } from './utils.js';

const UPCOMING_WINDOW_DAYS = 30;
const UPCOMING_LIST_LIMIT = 10;
const UPCOMING_SOURCE_PRIORITY = {
  oneOff: 0,
  recurring: 1,
} as const;
const RECURRING_UPCOMING_PREFIX = 'recurring';
const RECURRING_FALLBACK_TITLE = 'Recurring payment';

type DashboardUpcomingItem = DashboardRecentResponse['upcomingPaymentsDueSoon'][number];

function toAccountBalance(
  account: AccountDocument,
  balanceByAccountId: Map<string, number>,
): DashboardRecentResponse['balances'][number] {
  return {
    accountId: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    balance: balanceByAccountId.get(account.id) ?? 0,
  };
}

function toDashboardUpcomingPaymentDto(payment: UpcomingPaymentDocument): DashboardUpcomingItem {
  return {
    id: payment.id,
    title: payment.title,
    amount: payment.amount,
    currency: payment.currency,
    dueDate: payment.dueDate.toISOString(),
    sourceType: 'oneOff',
  };
}

function normalizeUpcomingTitle(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function toUtcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toAmountKey(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function buildUpcomingDedupeKey({
  amount,
  currency,
  dueDate,
  title,
}: {
  amount: number;
  currency: string;
  dueDate: Date;
  title: string;
}): string {
  return [toUtcDateKey(dueDate), toAmountKey(amount), currency, normalizeUpcomingTitle(title)].join('|');
}

function scheduleAtDay(
  year: number,
  month: number,
  day: number,
  anchor: Date,
): Date {
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

function advanceRecurringOccurrence(
  current: Date,
  cadence: 'weekly' | 'monthly',
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): Date | null {
  if (cadence === 'weekly') {
    if (dayOfWeek === null) {
      return null;
    }

    const next = new Date(current);
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  if (dayOfMonth === null) {
    return null;
  }

  return scheduleAtDay(current.getUTCFullYear(), current.getUTCMonth() + 1, dayOfMonth, current);
}

function projectRecurringOccurrenceInWindow(
  rule: RecurringRuleDocument,
  rangeStart: Date,
  rangeEnd: Date,
): Date | null {
  let occurrence = new Date(rule.nextRunAt);
  if (Number.isNaN(occurrence.getTime())) {
    return null;
  }

  const minimumTimestamp = Math.max(rangeStart.getTime(), rule.startAt.getTime());
  let guard = 0;
  while (occurrence.getTime() < minimumTimestamp) {
    const nextOccurrence = advanceRecurringOccurrence(
      occurrence,
      rule.cadence,
      rule.dayOfWeek ?? null,
      rule.dayOfMonth ?? null,
    );
    if (!nextOccurrence) {
      return null;
    }

    occurrence = nextOccurrence;
    guard += 1;
    if (guard > 240) {
      return null;
    }
  }

  if (rule.endAt && occurrence.getTime() > rule.endAt.getTime()) {
    return null;
  }
  if (occurrence.getTime() > rangeEnd.getTime()) {
    return null;
  }

  return occurrence;
}

function resolveRecurringUpcomingTitle(
  rule: RecurringRuleDocument,
  categoryNameById: Map<string, string>,
): string {
  const description = rule.description?.trim();
  if (description) {
    return description;
  }

  if (rule.categoryId) {
    const categoryName = categoryNameById.get(rule.categoryId.toString());
    if (categoryName?.trim()) {
      return categoryName;
    }
  }

  return RECURRING_FALLBACK_TITLE;
}

export function registerDashboardRoutes(app: FastifyInstance): void {
  app.get('/dashboard/recent', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');

    const now = new Date();
    const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + UPCOMING_WINDOW_DAYS);
    rangeEnd.setUTCHours(23, 59, 59, 999);

    const [recentTransactions, accounts, aggregatedBalances, upcomingPayments, recurringRules] =
      await Promise.all([
        TransactionModel.find({ userId, deletedAt: null }).sort({ occurredAt: -1, _id: -1 }).limit(10),
        AccountModel.find({ userId, deletedAt: null }).sort({ createdAt: -1 }),
        TransactionModel.aggregate<{
          _id: Types.ObjectId;
          balance: number;
        }>([
          { $match: { userId, deletedAt: null } },
          {
            $group: {
              _id: '$accountId',
              income: {
                $sum: {
                  $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0],
                },
              },
              expense: {
                $sum: {
                  $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0],
                },
              },
            },
          },
          {
            $project: {
              balance: { $subtract: ['$income', '$expense'] },
            },
          },
        ]),
        UpcomingPaymentModel.find({
          userId,
          status: 'upcoming',
          dueDate: { $gte: rangeStart, $lte: rangeEnd },
        })
          .sort({ dueDate: 1, _id: 1 })
          .limit(100),
        RecurringRuleModel.find({
          userId,
          kind: 'normal',
          type: 'expense',
          isPaused: false,
          deletedAt: null,
          startAt: { $lte: rangeEnd },
          nextRunAt: { $lte: rangeEnd },
          $or: [{ endAt: null }, { endAt: { $gte: rangeStart } }],
        })
          .sort({ nextRunAt: 1, _id: 1 })
          .limit(100),
      ]);

    const recurringCategoryIds = Array.from(
      new Map(
        recurringRules
          .map((rule) => rule.categoryId)
          .filter((value): value is Types.ObjectId => value !== null)
          .map((id) => [id.toString(), id]),
      ).values(),
    );

    const recurringCategories = recurringCategoryIds.length
      ? await CategoryModel.find({ _id: { $in: recurringCategoryIds } }).select('_id name')
      : [];

    const categoryNameById = new Map(recurringCategories.map((category) => [category.id, category.name]));
    const accountCurrencyById = new Map(accounts.map((account) => [account.id, account.currency]));

    const dedupeKeys = new Set<string>();
    const recurringTemplateIds = new Set(
      upcomingPayments
        .map((payment) => payment.recurringTemplateId?.toString() ?? null)
        .filter((value): value is string => value !== null),
    );

    const mergedUpcomingItems: DashboardUpcomingItem[] = [];

    for (const payment of upcomingPayments) {
      const dedupeKey = buildUpcomingDedupeKey({
        title: payment.title,
        amount: payment.amount,
        currency: payment.currency,
        dueDate: payment.dueDate,
      });

      if (dedupeKeys.has(dedupeKey)) {
        continue;
      }

      dedupeKeys.add(dedupeKey);
      mergedUpcomingItems.push(toDashboardUpcomingPaymentDto(payment));
    }

    for (const rule of recurringRules) {
      if (recurringTemplateIds.has(rule.id) || !rule.accountId) {
        continue;
      }

      const accountCurrency = accountCurrencyById.get(rule.accountId.toString());
      if (!accountCurrency) {
        continue;
      }

      const occurrence = projectRecurringOccurrenceInWindow(rule, rangeStart, rangeEnd);
      if (!occurrence) {
        continue;
      }

      const title = resolveRecurringUpcomingTitle(rule, categoryNameById);
      const dedupeKey = buildUpcomingDedupeKey({
        title,
        amount: rule.amount,
        currency: accountCurrency,
        dueDate: occurrence,
      });

      if (dedupeKeys.has(dedupeKey)) {
        continue;
      }

      dedupeKeys.add(dedupeKey);
      mergedUpcomingItems.push({
        id: `${RECURRING_UPCOMING_PREFIX}:${rule.id}:${occurrence.toISOString()}`,
        title,
        amount: rule.amount,
        currency: accountCurrency,
        dueDate: occurrence.toISOString(),
        sourceType: 'recurring',
      });
    }

    mergedUpcomingItems.sort((left, right) => {
      const leftDue = new Date(left.dueDate).getTime();
      const rightDue = new Date(right.dueDate).getTime();
      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      if (left.sourceType !== right.sourceType) {
        return UPCOMING_SOURCE_PRIORITY[left.sourceType] - UPCOMING_SOURCE_PRIORITY[right.sourceType];
      }

      return left.id.localeCompare(right.id);
    });

    const balanceByAccountId = new Map<string, number>(
      aggregatedBalances.map((entry) => [entry._id.toString(), entry.balance]),
    );

    const balances = accounts.map((account) => toAccountBalance(account, balanceByAccountId));
    const totalBalance = balances.reduce((sum, accountBalance) => sum + accountBalance.balance, 0);

    return dashboardRecentResponseSchema.parse({
      recentTransactions: recentTransactions.map((transaction) => toTransactionDto(transaction)),
      totalBalance,
      balances,
      upcomingPaymentsDueSoon: mergedUpcomingItems.slice(0, UPCOMING_LIST_LIMIT),
    });
  });
}
