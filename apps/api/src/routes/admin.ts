import type { FastifyInstance } from 'fastify';
import { type PipelineStage, Types } from 'mongoose';
import { z } from 'zod';

import { requireAdmin } from '../auth/middleware.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_DAYS = 7;
const INACTIVE_WINDOW_DAYS = 30;
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_CHUNK_SIZE = 100;

const dateOnlyStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD');
const queryBooleanSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  return value;
}, z.boolean());
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(25);
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code');

const usersQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  from: dateOnlyStringSchema.optional(),
  to: dateOnlyStringSchema.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  provider: z.enum(['google', 'apple', 'none']).optional(),
  page: pageSchema,
  limit: limitSchema,
});

const transactionsQuerySchema = z.object({
  search: z.string().trim().min(1).max(160).optional(),
  type: z.enum(['income', 'expense']).optional(),
  kind: z.enum(['normal', 'transfer']).optional(),
  currency: currencySchema.optional(),
  userId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  categoryKey: z.string().trim().min(1).max(120).optional(),
  from: dateOnlyStringSchema.optional(),
  to: dateOnlyStringSchema.optional(),
  deleted: queryBooleanSchema.default(false),
  page: pageSchema,
  limit: limitSchema,
});

const timeseriesQuerySchema = z.object({
  from: dateOnlyStringSchema.optional(),
  to: dateOnlyStringSchema.optional(),
  tz: z.string().trim().min(1).max(120).default('UTC'),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  currency: currencySchema.optional(),
});

const categoryAnalyticsQuerySchema = z.object({
  from: dateOnlyStringSchema.optional(),
  to: dateOnlyStringSchema.optional(),
  type: z.enum(['income', 'expense']).optional(),
  currency: currencySchema.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const retentionQuerySchema = z.object({
  cohort: z.enum(['weekly', 'monthly']).default('monthly'),
  from: dateOnlyStringSchema.optional(),
  to: dateOnlyStringSchema.optional(),
});

const notificationTokensQuerySchema = z.object({
  platform: z.enum(['ios', 'android']).optional(),
  hasToken: queryBooleanSchema.optional(),
  page: pageSchema,
  limit: limitSchema,
});

const adminNotificationSendBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(1000),
    target: z.enum(['all', 'hasToken', 'users']),
    userIds: z.array(z.string().trim().min(1)).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.target === 'users' && (!Array.isArray(value.userIds) || value.userIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['userIds'],
        message: 'userIds is required when target=users',
      });
    }
  });

interface SafeExpoPushTokenMeta {
  platform: 'ios' | 'android' | null;
  updatedAt: Date | null;
}

interface UserListAggregateRow {
  _id: Types.ObjectId;
  email: string;
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt?: Date | null;
  notificationsEnabled: boolean;
  providers?: Array<{ provider: 'google' | 'apple'; uid: string }>;
  baseCurrency?: string | null;
  savingsTargetRate: number;
  riskProfile: 'low' | 'medium' | 'high';
  expoPushTokens?: Array<{
    token: string;
    device?: string | null;
    platform?: 'ios' | 'android' | null;
    updatedAt?: Date | null;
  }>;
  lastTransactionAt?: Date | null;
  derivedLastActiveAt?: Date | null;
}

interface UserActivityAggregateRow {
  _id: Types.ObjectId;
  totalCount: number;
  transferCount: number;
  incomeTotal: number;
  expenseTotal: number;
  firstTransactionAt?: Date | null;
  lastTransactionAt?: Date | null;
  currenciesUsed: string[];
}

function toDayStartUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDayEndUtc(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

function shiftUtcDays(value: Date, amount: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function defaultDateRange(days = 30): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);

  return { from, to };
}

function resolveDateRange(
  fromValue: string | undefined,
  toValue: string | undefined,
  fallbackDays = 30,
): { from: Date; to: Date } {
  if (!fromValue && !toValue) {
    return defaultDateRange(fallbackDays);
  }

  const from = toDayStartUtc(fromValue ?? toValue!);
  const to = toDayEndUtc(toValue ?? fromValue!);

  if (from.getTime() > to.getTime()) {
    return {
      from: toDayStartUtc(toValue ?? fromValue!),
      to: toDayEndUtc(fromValue ?? toValue!),
    };
  }

  return { from, to };
}

function inclusiveDayCount(range: { from: Date; to: Date }): number {
  return Math.max(1, Math.floor((range.to.getTime() - range.from.getTime()) / DAY_MS) + 1);
}

function previousPeriodFor(range: { from: Date; to: Date }): { from: Date; to: Date } {
  const days = inclusiveDayCount(range);
  const previousTo = shiftUtcDays(range.from, -1);
  previousTo.setUTCHours(23, 59, 59, 999);
  const previousFrom = shiftUtcDays(range.from, -days);
  previousFrom.setUTCHours(0, 0, 0, 0);

  return {
    from: previousFrom,
    to: previousTo,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueProviders(
  providers: Array<{ provider: 'google' | 'apple'; uid: string }> | undefined,
): Array<'google' | 'apple'> {
  const seen = new Set<'google' | 'apple'>();
  const values = providers ?? [];

  for (const item of values) {
    seen.add(item.provider);
  }

  return Array.from(seen);
}

function toSafeTokenMeta(
  tokens: Array<{ platform?: 'ios' | 'android' | null; updatedAt?: Date | null }> | undefined,
): { count: number; lastUpdatedAt: string | null; platformSplit: { ios: number; android: number } } {
  let lastUpdatedAt: Date | null = null;
  let ios = 0;
  let android = 0;
  const values = tokens ?? [];

  for (const token of values) {
    if (token.platform === 'ios') {
      ios += 1;
    }
    if (token.platform === 'android') {
      android += 1;
    }

    if (token.updatedAt instanceof Date && (!lastUpdatedAt || token.updatedAt > lastUpdatedAt)) {
      lastUpdatedAt = token.updatedAt;
    }
  }

  return {
    count: values.length,
    lastUpdatedAt: toIso(lastUpdatedAt),
    platformSplit: {
      ios,
      android,
    },
  };
}

function toIso(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toIsoOrNull(value: Date | null | undefined): string | null {
  return toIso(value);
}

function resolveDerivedLastActiveAt(
  lastActiveAt: Date | null | undefined,
  lastTransactionAt: Date | null | undefined,
): Date | null {
  if (lastActiveAt instanceof Date) {
    return lastActiveAt;
  }

  if (lastTransactionAt instanceof Date) {
    return lastTransactionAt;
  }

  return null;
}

function isActiveWithin(value: Date | null, days: number, now: Date): boolean {
  if (!value) {
    return false;
  }

  return value.getTime() >= now.getTime() - days * DAY_MS;
}

function buildDateTruncExpression(
  field: string,
  unit: 'day' | 'week' | 'month',
  timezone: string,
): { $dateTrunc: Record<string, unknown> } {
  if (unit === 'week') {
    return {
      $dateTrunc: {
        date: field,
        unit,
        timezone,
        startOfWeek: 'monday',
      },
    };
  }

  return {
    $dateTrunc: {
      date: field,
      unit,
      timezone,
    },
  };
}

function startOfIsoWeek(value: Date): Date {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function startOfCohortBucket(value: Date, cohort: 'weekly' | 'monthly'): Date {
  if (cohort === 'weekly') {
    return startOfIsoWeek(value);
  }

  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addCohortBuckets(value: Date, cohort: 'weekly' | 'monthly', amount: number): Date {
  const next = new Date(value);

  if (cohort === 'weekly') {
    next.setUTCDate(next.getUTCDate() + amount * 7);
    return next;
  }

  next.setUTCMonth(next.getUTCMonth() + amount);
  return new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), 1, 0, 0, 0, 0));
}

function cohortBucketKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }

  const left = sorted[mid - 1] ?? 0;
  const right = sorted[mid] ?? 0;
  return (left + right) / 2;
}

function histogramBucketLabel(min: number, max: number): string {
  return `${Math.round(min * 100)}-${Math.round(max * 100)}%`;
}

function buildHistogram(values: number[]): Array<{ label: string; min: number; max: number; count: number }> {
  const buckets = [
    { min: 0, max: 0.5 },
    { min: 0.5, max: 0.8 },
    { min: 0.8, max: 1.0 },
    { min: 1.0, max: 1.2 },
    { min: 1.2, max: Number.POSITIVE_INFINITY },
  ];

  return buckets.map((bucket) => ({
    label:
      bucket.max === Number.POSITIVE_INFINITY
        ? `${Math.round(bucket.min * 100)}%+`
        : histogramBucketLabel(bucket.min, bucket.max),
    min: bucket.min,
    max: Number.isFinite(bucket.max) ? bucket.max : -1,
    count: values.filter((value) =>
      bucket.max === Number.POSITIVE_INFINITY
        ? value >= bucket.min
        : value >= bucket.min && value < bucket.max,
    ).length,
  }));
}

function isExpoPushToken(value: string): boolean {
  return /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(value.trim());
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size) as T[]);
  }

  return chunks;
}

async function sendExpoPushNotifications(
  tokens: string[],
  payload: { title: string; body: string },
): Promise<number> {
  if (tokens.length === 0) {
    return 0;
  }

  let sent = 0;

  for (const tokenChunk of chunkArray(tokens, EXPO_PUSH_CHUNK_SIZE)) {
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          tokenChunk.map((token) => ({
            to: token,
            title: payload.title,
            body: payload.body,
            sound: 'default',
          })),
        ),
      });

      if (!response.ok) {
        continue;
      }

      const parsed = (await response.json().catch(() => null)) as
        | {
            data?:
              | Array<{
                  status?: string;
                }>
              | {
                  status?: string;
                };
          }
        | null;

      if (!parsed || parsed.data === undefined) {
        sent += tokenChunk.length;
        continue;
      }

      if (Array.isArray(parsed.data)) {
        sent += parsed.data.reduce((count, item) => count + (item?.status === 'error' ? 0 : 1), 0);
        continue;
      }

      sent += parsed.data.status === 'error' ? 0 : tokenChunk.length;
    } catch {
      continue;
    }
  }

  return sent;
}

function toSafeUserSummary(row: UserListAggregateRow, now: Date) {
  const tokenMeta = toSafeTokenMeta(row.expoPushTokens);
  const derivedLastActiveAt = resolveDerivedLastActiveAt(row.lastActiveAt ?? null, row.lastTransactionAt ?? null);

  return {
    id: row._id.toString(),
    email: row.email,
    name: row.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastActiveAt: toIsoOrNull(derivedLastActiveAt),
    activeDerivedFrom: row.lastActiveAt ? 'lastActiveAt' : row.lastTransactionAt ? 'transactions' : 'none',
    isActive: isActiveWithin(derivedLastActiveAt, ACTIVE_WINDOW_DAYS, now),
    notificationsEnabled: row.notificationsEnabled,
    expoPushTokensCount: tokenMeta.count,
    expoPushTokensLastUpdatedAt: tokenMeta.lastUpdatedAt,
    providers: uniqueProviders(row.providers),
    baseCurrency: row.baseCurrency ?? null,
    savingsTargetRate: row.savingsTargetRate,
    riskProfile: row.riskProfile,
  };
}

async function getAdminSessionPayload(adminUserId: string) {
  const admin = await UserModel.findById(adminUserId)
    .select('_id email name role createdAt')
    .lean<
      | {
          _id: Types.ObjectId;
          email: string;
          name?: string | null;
          role: 'user' | 'admin';
          createdAt: Date;
        }
      | null
    >();

  if (!admin) {
    return null;
  }

  return {
    admin: {
      id: admin._id.toString(),
      email: admin.email,
      name: admin.name ?? null,
      role: admin.role,
      createdAt: admin.createdAt.toISOString(),
    },
  };
}

async function aggregateUserActivity(userIds: Types.ObjectId[]): Promise<Map<string, UserActivityAggregateRow>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await TransactionModel.aggregate<UserActivityAggregateRow>([
    {
      $match: {
        userId: {
          $in: userIds,
        },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: '$userId',
        totalCount: { $sum: 1 },
        transferCount: {
          $sum: {
            $cond: [{ $eq: ['$kind', 'transfer'] }, 1, 0],
          },
        },
        incomeTotal: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ['$kind', 'normal'] }, { $eq: ['$type', 'income'] }],
              },
              '$amount',
              0,
            ],
          },
        },
        expenseTotal: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ['$kind', 'normal'] }, { $eq: ['$type', 'expense'] }],
              },
              '$amount',
              0,
            ],
          },
        },
        firstTransactionAt: { $min: '$occurredAt' },
        lastTransactionAt: { $max: '$occurredAt' },
        currenciesUsed: { $addToSet: '$currency' },
      },
    },
  ]);

  return new Map(rows.map((row) => [row._id.toString(), row]));
}

export function registerAdminRoutes(app: FastifyInstance): void {
  app.get('/admin/session', { preHandler: requireAdmin }, async (request) => {
    const user = requireUser(request);
    const payload = await getAdminSessionPayload(user.id);

    return payload ?? { admin: null };
  });

  app.get('/admin/overview', { preHandler: requireAdmin }, async () => {
    const now = new Date();
    const activeThreshold = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS);
    const inactiveThreshold = new Date(now.getTime() - INACTIVE_WINDOW_DAYS * DAY_MS);
    const userRows = await UserModel.find({ role: { $ne: 'admin' } })
      .select('_id createdAt lastActiveAt')
      .lean<Array<{ _id: Types.ObjectId; createdAt: Date; lastActiveAt?: Date | null }>>();
    const userIds = userRows.map((row) => row._id);

    const [
      userActivityById,
      financeTotals,
      volumeCounts,
      topCurrenciesRows,
      medianNetRows,
    ] = await Promise.all([
      aggregateUserActivity(userIds),
      TransactionModel.aggregate<{
        totalTransactions: number;
        deletedTransactionsCount: number;
        transfersCount: number;
        missingCategoryCount: number;
        last7DaysTransactions: number;
        last30DaysTransactions: number;
        totalIncome: number;
        totalExpense: number;
      }>([
        {
          $group: {
            _id: null,
            totalTransactions: {
              $sum: {
                $cond: [{ $eq: ['$deletedAt', null] }, 1, 0],
              },
            },
            deletedTransactionsCount: {
              $sum: {
                $cond: [{ $ne: ['$deletedAt', null] }, 1, 0],
              },
            },
            transfersCount: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ['$deletedAt', null] }, { $eq: ['$kind', 'transfer'] }],
                  },
                  1,
                  0,
                ],
              },
            },
        missingCategoryCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$deletedAt', null] },
                      { $eq: ['$kind', 'normal'] },
                      { $eq: ['$categoryId', null] },
                      {
                        $or: [{ $eq: ['$categoryKey', null] }, { $eq: ['$categoryKey', ''] }],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            last7DaysTransactions: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ['$deletedAt', null] }, { $gte: ['$occurredAt', activeThreshold] }],
                  },
                  1,
                  0,
                ],
              },
            },
            last30DaysTransactions: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ['$deletedAt', null] }, { $gte: ['$occurredAt', inactiveThreshold] }],
                  },
                  1,
                  0,
                ],
              },
            },
            totalIncome: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$deletedAt', null] },
                      { $eq: ['$kind', 'normal'] },
                      { $eq: ['$type', 'income'] },
                    ],
                  },
                  '$amount',
                  0,
                ],
              },
            },
            totalExpense: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$deletedAt', null] },
                      { $eq: ['$kind', 'normal'] },
                      { $eq: ['$type', 'expense'] },
                    ],
                  },
                  '$amount',
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalTransactions: 1,
            deletedTransactionsCount: 1,
            transfersCount: 1,
            missingCategoryCount: 1,
            last7DaysTransactions: 1,
            last30DaysTransactions: 1,
            totalIncome: 1,
            totalExpense: 1,
          },
        },
      ]),
      UserModel.aggregate<{ totalUsers: number; newUsers7d: number; newUsers30d: number }>([
        {
          $match: {
            role: { $ne: 'admin' },
          },
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            newUsers7d: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', activeThreshold] }, 1, 0],
              },
            },
            newUsers30d: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', inactiveThreshold] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalUsers: 1,
            newUsers7d: 1,
            newUsers30d: 1,
          },
        },
      ]),
      TransactionModel.aggregate<{ currency: string; count: number; totalAmount: number }>([
        {
          $match: {
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: '$currency',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
        { $sort: { count: -1, totalAmount: -1, _id: 1 } },
        { $limit: 5 },
        {
          $project: {
            _id: 0,
            currency: '$_id',
            count: 1,
            totalAmount: 1,
          },
        },
      ]),
      TransactionModel.aggregate<{ month: Date; netByUser: number[] }>([
        {
          $match: {
            deletedAt: null,
            kind: 'normal',
            occurredAt: {
              $gte: shiftUtcDays(now, -180),
            },
          },
        },
        {
          $group: {
            _id: {
              month: buildDateTruncExpression('$occurredAt', 'month', 'UTC').$dateTrunc,
              userId: '$userId',
            },
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
            month: '$_id.month',
            net: { $subtract: ['$incomeTotal', '$expenseTotal'] },
          },
        },
        {
          $group: {
            _id: '$month',
            netByUser: { $push: '$net' },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            month: '$_id',
            netByUser: 1,
          },
        },
      ]),
    ]);

    const userCounts = volumeCounts[0] ?? {
      totalUsers: 0,
      newUsers7d: 0,
      newUsers30d: 0,
    };
    const totals = financeTotals[0] ?? {
      totalTransactions: 0,
      deletedTransactionsCount: 0,
      transfersCount: 0,
      missingCategoryCount: 0,
      last7DaysTransactions: 0,
      last30DaysTransactions: 0,
      totalIncome: 0,
      totalExpense: 0,
    };

    let dau = 0;
    let wau = 0;
    let mau = 0;
    let transferHeavyUsersCount = 0;
    let multiCurrencyUsersCount = 0;
    let usersWithoutTransactionsCount = 0;
    let savingsRateAccumulator = 0;
    let savingsRateUsers = 0;
    const expenseToIncomeRatios: number[] = [];
    let recentSignups = 0;
    let recentSignupsWithFirstTransaction = 0;
    const timeToFirstTransactionDays: number[] = [];

    for (const user of userRows) {
      const activity = userActivityById.get(user._id.toString());
      const derivedLastActiveAt = resolveDerivedLastActiveAt(
        user.lastActiveAt ?? null,
        activity?.lastTransactionAt ?? null,
      );

      if (isActiveWithin(derivedLastActiveAt, 1, now)) {
        dau += 1;
      }
      if (isActiveWithin(derivedLastActiveAt, ACTIVE_WINDOW_DAYS, now)) {
        wau += 1;
      }
      if (isActiveWithin(derivedLastActiveAt, INACTIVE_WINDOW_DAYS, now)) {
        mau += 1;
      }

      if (!activity || activity.totalCount === 0) {
        usersWithoutTransactionsCount += 1;
      } else {
        if (activity.transferCount / activity.totalCount >= 0.4) {
          transferHeavyUsersCount += 1;
        }

        if (activity.currenciesUsed.length > 1) {
          multiCurrencyUsersCount += 1;
        }

        if (activity.incomeTotal > 0) {
          const savingsRate = (activity.incomeTotal - activity.expenseTotal) / activity.incomeTotal;
          savingsRateAccumulator += savingsRate;
          savingsRateUsers += 1;
          expenseToIncomeRatios.push(activity.expenseTotal / activity.incomeTotal);
        }
      }

      if (user.createdAt.getTime() >= inactiveThreshold.getTime()) {
        recentSignups += 1;

        if (activity?.firstTransactionAt instanceof Date) {
          recentSignupsWithFirstTransaction += 1;
          timeToFirstTransactionDays.push(
            Math.max(
              0,
              Math.round(
                (activity.firstTransactionAt.getTime() - user.createdAt.getTime()) / DAY_MS,
              ),
            ),
          );
        }
      }
    }

    const nonDeletedTransactionsTotal = totals.totalTransactions;
    const allTransactionsTotal = totals.totalTransactions + totals.deletedTransactionsCount;

    return {
      totalUsers: userCounts.totalUsers,
      activeUsers: {
        dau,
        wau,
        mau,
      },
      newUsers: {
        last7Days: userCounts.newUsers7d,
        last30Days: userCounts.newUsers30d,
      },
      totalTransactions: totals.totalTransactions,
      totalIncome: totals.totalIncome,
      totalExpense: totals.totalExpense,
      net: totals.totalIncome - totals.totalExpense,
      avgDailyTransactions: {
        last7Days: Number((totals.last7DaysTransactions / 7).toFixed(2)),
        last30Days: Number((totals.last30DaysTransactions / 30).toFixed(2)),
      },
      topCurrencies: topCurrenciesRows,
      transfersCount: totals.transfersCount,
      deletedTransactionsCount: totals.deletedTransactionsCount,
      dataQuality: {
        missingCategoryCount: totals.missingCategoryCount,
        transferRatio:
          nonDeletedTransactionsTotal > 0 ? totals.transfersCount / nonDeletedTransactionsTotal : 0,
        deletedRatio: allTransactionsTotal > 0 ? totals.deletedTransactionsCount / allTransactionsTotal : 0,
      },
      activationFunnel: {
        signupsLast30Days: recentSignups,
        usersWithFirstTransactionLast30Days: recentSignupsWithFirstTransaction,
        conversionRate:
          recentSignups > 0 ? recentSignupsWithFirstTransaction / recentSignups : 0,
        medianDaysToFirstTransaction: median(timeToFirstTransactionDays),
      },
      behaviorSegments: {
        transferHeavyUsersCount,
        transferHeavyUsersRatio:
          userCounts.totalUsers > 0 ? transferHeavyUsersCount / userCounts.totalUsers : 0,
        multiCurrencyUsersCount,
        multiCurrencyUsersRatio:
          userCounts.totalUsers > 0 ? multiCurrencyUsersCount / userCounts.totalUsers : 0,
        usersWithoutTransactionsCount,
        usersWithoutTransactionsRatio:
          userCounts.totalUsers > 0 ? usersWithoutTransactionsCount / userCounts.totalUsers : 0,
      },
      financialSignals: {
        averageSavingsRateProxy:
          savingsRateUsers > 0 ? savingsRateAccumulator / savingsRateUsers : 0,
        expenseToIncomeDistribution: buildHistogram(expenseToIncomeRatios),
        medianNetByMonth: medianNetRows.map((row) => ({
          month: toIso(row.month),
          medianNet: median(row.netByUser),
        })),
      },
      generatedAt: now.toISOString(),
    };
  });

  app.get('/admin/users', { preHandler: requireAdmin }, async (request) => {
    const query = parseQuery(usersQuerySchema, request.query);
    const now = new Date();
    const activeThreshold = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS);
    const inactiveThreshold = new Date(now.getTime() - INACTIVE_WINDOW_DAYS * DAY_MS);
    const match: Record<string, unknown> = {
      role: { $ne: 'admin' },
    };

    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search), 'i');
      match.$or = [{ email: regex }, { name: regex }];
    }

    if (query.from || query.to) {
      const range = resolveDateRange(query.from, query.to, 30);
      match.createdAt = {
        $gte: range.from,
        $lte: range.to,
      };
    }

    if (query.provider === 'google' || query.provider === 'apple') {
      match.providers = {
        $elemMatch: {
          provider: query.provider,
        },
      };
    } else if (query.provider === 'none') {
      match['providers.0'] = {
        $exists: false,
      };
    }

    const pipeline = [
      {
        $match: match,
      },
      {
        $lookup: {
          from: 'transactions',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$userId', '$$userId'] }, { $eq: ['$deletedAt', null] }],
                },
              },
            },
            { $sort: { occurredAt: -1, _id: -1 } },
            { $limit: 1 },
            {
              $project: {
                _id: 0,
                occurredAt: 1,
              },
            },
          ],
          as: 'latestTransaction',
        },
      },
      {
        $addFields: {
          lastTransactionAt: {
            $let: {
              vars: {
                first: { $arrayElemAt: ['$latestTransaction', 0] },
              },
              in: '$$first.occurredAt',
            },
          },
          derivedLastActiveAt: {
            $ifNull: [
              '$lastActiveAt',
              {
                $let: {
                  vars: {
                    first: { $arrayElemAt: ['$latestTransaction', 0] },
                  },
                  in: '$$first.occurredAt',
                },
              },
            ],
          },
        },
      },
    ] as PipelineStage[];

    if (query.status === 'active') {
      pipeline.push({
        $match: {
          derivedLastActiveAt: {
            $gte: activeThreshold,
          },
        },
      });
    } else if (query.status === 'inactive') {
      pipeline.push({
        $match: {
          $or: [
            {
              derivedLastActiveAt: {
                $lt: inactiveThreshold,
              },
            },
            {
              derivedLastActiveAt: null,
            },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: (query.page - 1) * query.limit },
            { $limit: query.limit },
            {
              $project: {
                _id: 1,
                email: 1,
                name: 1,
                createdAt: 1,
                updatedAt: 1,
                lastActiveAt: 1,
                notificationsEnabled: 1,
                providers: 1,
                baseCurrency: 1,
                savingsTargetRate: 1,
                riskProfile: 1,
                expoPushTokens: 1,
                lastTransactionAt: 1,
                derivedLastActiveAt: 1,
              },
            },
          ],
          meta: [{ $count: 'total' }],
        },
      },
    );

    const result = await UserModel.aggregate<{
      rows: UserListAggregateRow[];
      meta: Array<{ total: number }>;
    }>(pipeline);

    const payload = result[0] ?? { rows: [], meta: [] };
    const total = payload.meta[0]?.total ?? 0;

    return {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total > 0 ? Math.ceil(total / query.limit) : 0,
      users: payload.rows.map((row) => toSafeUserSummary(row, now)),
    };
  });

  app.get('/admin/users/:id', { preHandler: requireAdmin }, async (request) => {
    const params = parseQuery(z.object({ id: z.string().trim().min(1) }), request.params);
    const userId = parseObjectId(params.id, 'userId');
    const now = new Date();
    const row = await UserModel.findOne({ _id: userId, role: { $ne: 'admin' } })
      .select(
        '_id email name createdAt updatedAt lastActiveAt notificationsEnabled providers baseCurrency savingsTargetRate riskProfile expoPushTokens',
      )
      .lean<UserListAggregateRow | null>();

    if (!row) {
      return {
        user: null,
      };
    }

    const [activity] = await TransactionModel.aggregate<UserActivityAggregateRow>([
      {
        $match: {
          userId,
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: '$userId',
          totalCount: { $sum: 1 },
          transferCount: {
            $sum: {
              $cond: [{ $eq: ['$kind', 'transfer'] }, 1, 0],
            },
          },
          incomeTotal: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ['$kind', 'normal'] }, { $eq: ['$type', 'income'] }],
                },
                '$amount',
                0,
              ],
            },
          },
          expenseTotal: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ['$kind', 'normal'] }, { $eq: ['$type', 'expense'] }],
                },
                '$amount',
                0,
              ],
            },
          },
          firstTransactionAt: { $min: '$occurredAt' },
          lastTransactionAt: { $max: '$occurredAt' },
          currenciesUsed: { $addToSet: '$currency' },
        },
      },
    ]);

    const tokenMeta = toSafeTokenMeta(row.expoPushTokens);
    const derivedLastActiveAt = resolveDerivedLastActiveAt(
      row.lastActiveAt ?? null,
      activity?.lastTransactionAt ?? null,
    );

    return {
      user: {
        ...toSafeUserSummary(row, now),
        transactionStats: {
          count: activity?.totalCount ?? 0,
          firstTransactionAt: toIsoOrNull(activity?.firstTransactionAt),
          lastTransactionAt: toIsoOrNull(activity?.lastTransactionAt),
          currenciesUsed: activity?.currenciesUsed ?? [],
          transferRatio:
            activity && activity.totalCount > 0 ? activity.transferCount / activity.totalCount : 0,
          incomeTotal: activity?.incomeTotal ?? 0,
          expenseTotal: activity?.expenseTotal ?? 0,
        },
        notificationSummary: {
          tokensCount: tokenMeta.count,
          lastUpdatedAt: tokenMeta.lastUpdatedAt,
          platformSplit: tokenMeta.platformSplit,
        },
        activity: {
          lastActiveAt: toIsoOrNull(derivedLastActiveAt),
          isActive: isActiveWithin(derivedLastActiveAt, ACTIVE_WINDOW_DAYS, now),
        },
      },
    };
  });

  app.get('/admin/transactions', { preHandler: requireAdmin }, async (request) => {
    const query = parseQuery(transactionsQuerySchema, request.query);
    const match: Record<string, unknown> = {
      deletedAt: query.deleted ? { $ne: null } : null,
    };

    if (query.type) {
      match.type = query.type;
    }

    if (query.kind) {
      match.kind = query.kind;
    }

    if (query.currency) {
      match.currency = query.currency;
    }

    if (query.userId) {
      match.userId = parseObjectId(query.userId, 'userId');
    }

    if (query.accountId) {
      match.accountId = parseObjectId(query.accountId, 'accountId');
    }

    if (query.categoryKey) {
      match.categoryKey = query.categoryKey;
    }

    if (query.from || query.to) {
      const range = resolveDateRange(query.from, query.to, 30);
      match.occurredAt = {
        $gte: range.from,
        $lte: range.to,
      };
    }

    const pipeline = [
      {
        $match: match,
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
          pipeline: [
            {
              $project: {
                _id: 1,
                email: 1,
                name: 1,
                role: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: '$user',
      },
      {
        $match: {
          'user.role': { $ne: 'admin' },
        },
      },
    ] as PipelineStage[];

    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search), 'i');
      pipeline.push({
        $match: {
          $or: [
            { description: regex },
            { categoryKey: regex },
            { 'user.email': regex },
            { 'user.name': regex },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { occurredAt: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: (query.page - 1) * query.limit },
            { $limit: query.limit },
            {
              $project: {
                _id: 1,
                userId: 1,
                accountId: 1,
                categoryId: 1,
                categoryKey: 1,
                type: 1,
                kind: 1,
                transferGroupId: 1,
                transferDirection: 1,
                relatedAccountId: 1,
                amount: 1,
                currency: 1,
                description: 1,
                occurredAt: 1,
                createdAt: 1,
                updatedAt: 1,
                deletedAt: 1,
                user: {
                  id: '$user._id',
                  email: '$user.email',
                  name: '$user.name',
                },
              },
            },
          ],
          totals: [
            {
              $group: {
                _id: null,
                countTotal: { $sum: 1 },
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
                countTotal: 1,
                incomeTotal: 1,
                expenseTotal: 1,
                netTotal: { $subtract: ['$incomeTotal', '$expenseTotal'] },
              },
            },
          ],
        },
      },
    );

    const result = await TransactionModel.aggregate<{
      rows: Array<{
        _id: Types.ObjectId;
        userId: Types.ObjectId;
        accountId: Types.ObjectId;
        categoryId?: Types.ObjectId | null;
        categoryKey?: string | null;
        type: 'income' | 'expense';
        kind: 'normal' | 'transfer';
        transferGroupId?: Types.ObjectId | null;
        transferDirection?: 'in' | 'out' | null;
        relatedAccountId?: Types.ObjectId | null;
        amount: number;
        currency: string;
        description?: string | null;
        occurredAt: Date;
        createdAt: Date;
        updatedAt: Date;
        deletedAt?: Date | null;
        user: { id: Types.ObjectId; email: string; name?: string | null };
      }>;
      totals: Array<{ countTotal: number; incomeTotal: number; expenseTotal: number; netTotal: number }>;
    }>(pipeline);

    const payload = result[0] ?? { rows: [], totals: [] };
    const totals = payload.totals[0] ?? {
      countTotal: 0,
      incomeTotal: 0,
      expenseTotal: 0,
      netTotal: 0,
    };

    return {
      page: query.page,
      limit: query.limit,
      total: totals.countTotal,
      totalPages: totals.countTotal > 0 ? Math.ceil(totals.countTotal / query.limit) : 0,
      totals,
      transactions: payload.rows.map((row) => ({
        id: row._id.toString(),
        userId: row.userId.toString(),
        accountId: row.accountId.toString(),
        categoryId: row.categoryId ? row.categoryId.toString() : null,
        categoryKey: row.categoryKey ?? null,
        type: row.type,
        kind: row.kind,
        transferGroupId: row.transferGroupId ? row.transferGroupId.toString() : null,
        transferDirection: row.transferDirection ?? null,
        relatedAccountId: row.relatedAccountId ? row.relatedAccountId.toString() : null,
        amount: row.amount,
        currency: row.currency,
        description: row.description ?? null,
        occurredAt: row.occurredAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        user: {
          id: row.user.id.toString(),
          email: row.user.email,
          name: row.user.name ?? null,
        },
      })),
    };
  });

  app.get('/admin/analytics/transactions-timeseries', { preHandler: requireAdmin }, async (request) => {
    const query = parseQuery(timeseriesQuerySchema, request.query);
    const range = resolveDateRange(query.from, query.to, 30);

    const rows = await TransactionModel.aggregate<{
      bucketStart: Date;
      income: number;
      expense: number;
      count: number;
      net: number;
    }>([
      {
        $match: {
          deletedAt: null,
          kind: 'normal',
          occurredAt: {
            $gte: range.from,
            $lte: range.to,
          },
          ...(query.currency ? { currency: query.currency } : {}),
        },
      },
      {
        $group: {
          _id: buildDateTruncExpression('$occurredAt', query.granularity, query.tz).$dateTrunc,
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
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          bucketStart: '$_id',
          income: 1,
          expense: 1,
          count: 1,
          net: { $subtract: ['$income', '$expense'] },
        },
      },
      { $sort: { bucketStart: 1 } },
    ]);

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      granularity: query.granularity,
      timezone: query.tz,
      currency: query.currency ?? null,
      buckets: rows.map((row) => ({
        bucketStart: toIso(row.bucketStart),
        income: row.income,
        expense: row.expense,
        net: row.net,
        count: row.count,
      })),
    };
  });

  app.get('/admin/analytics/categories', { preHandler: requireAdmin }, async (request) => {
    const query = parseQuery(categoryAnalyticsQuerySchema, request.query);
    const range = resolveDateRange(query.from, query.to, 30);
    const previousRange = previousPeriodFor(range);
    const sharedMatch = {
      deletedAt: null,
      kind: 'normal',
      ...(query.type ? { type: query.type } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
    };

    const [currentRows, previousRows] = await Promise.all([
      TransactionModel.aggregate<{ categoryKey: string; total: number }>([
        {
          $match: {
            ...sharedMatch,
            occurredAt: {
              $gte: range.from,
              $lte: range.to,
            },
          },
        },
        {
          $group: {
            _id: {
              $ifNull: ['$categoryKey', 'uncategorized'],
            },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { total: -1, _id: 1 } },
        {
          $project: {
            _id: 0,
            categoryKey: '$_id',
            total: 1,
          },
        },
      ]),
      TransactionModel.aggregate<{ categoryKey: string; total: number }>([
        {
          $match: {
            ...sharedMatch,
            occurredAt: {
              $gte: previousRange.from,
              $lte: previousRange.to,
            },
          },
        },
        {
          $group: {
            _id: {
              $ifNull: ['$categoryKey', 'uncategorized'],
            },
            total: { $sum: '$amount' },
          },
        },
        {
          $project: {
            _id: 0,
            categoryKey: '$_id',
            total: 1,
          },
        },
      ]),
    ]);

    const previousByCategory = new Map(previousRows.map((row) => [row.categoryKey, row.total]));
    const currentTotal = currentRows.reduce((sum, row) => sum + row.total, 0);

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      type: query.type ?? null,
      currency: query.currency ?? null,
      categories: currentRows.slice(0, query.limit).map((row) => {
        const previousTotal = previousByCategory.get(row.categoryKey) ?? 0;
        const delta = row.total - previousTotal;
        const changePercent = previousTotal > 0 ? (delta / previousTotal) * 100 : row.total > 0 ? 100 : 0;

        return {
          categoryKey: row.categoryKey || 'uncategorized',
          total: row.total,
          percentOfTotal: currentTotal > 0 ? row.total / currentTotal : 0,
          trendVsPreviousPeriod: delta,
          changePercent,
        };
      }),
    };
  });

  app.get('/admin/analytics/users-retention', { preHandler: requireAdmin }, async (request) => {
    const query = parseQuery(retentionQuerySchema, request.query);
    const range = resolveDateRange(query.from, query.to, 180);
    const cohortMode = query.cohort;
    const activityWindowEnd = addCohortBuckets(startOfCohortBucket(range.to, cohortMode), cohortMode, 4);
    activityWindowEnd.setUTCHours(23, 59, 59, 999);

    const users = await UserModel.find({
      role: { $ne: 'admin' },
      createdAt: {
        $gte: range.from,
        $lte: range.to,
      },
    })
      .select('_id createdAt lastActiveAt')
      .lean<Array<{ _id: Types.ObjectId; createdAt: Date; lastActiveAt?: Date | null }>>();

    const userIds = users.map((user) => user._id);
    const transactionActivity = userIds.length
      ? await TransactionModel.aggregate<{ userId: Types.ObjectId; bucketStart: Date }>([
          {
            $match: {
              userId: {
                $in: userIds,
              },
              deletedAt: null,
              occurredAt: {
                $gte: range.from,
                $lte: activityWindowEnd,
              },
            },
          },
          {
            $group: {
              _id: {
                userId: '$userId',
                bucketStart:
                  cohortMode === 'weekly'
                    ? {
                        $dateTrunc: {
                          date: '$occurredAt',
                          unit: 'week',
                          timezone: 'UTC',
                          startOfWeek: 'monday',
                        },
                      }
                    : {
                        $dateTrunc: {
                          date: '$occurredAt',
                          unit: 'month',
                          timezone: 'UTC',
                        },
                      },
              },
            },
          },
          {
            $project: {
              _id: 0,
              userId: '$_id.userId',
              bucketStart: '$_id.bucketStart',
            },
          },
        ])
      : [];

    const activityByUser = new Map<string, Set<string>>();

    for (const row of transactionActivity) {
      const key = row.userId.toString();
      const bucketKey = cohortBucketKey(row.bucketStart);
      const existing = activityByUser.get(key) ?? new Set<string>();
      existing.add(bucketKey);
      activityByUser.set(key, existing);
    }

    const cohorts = new Map<
      string,
      {
        cohortStart: Date;
        cohortSize: number;
        retained1: number;
        retained2: number;
        retained3: number;
      }
    >();

    for (const user of users) {
      const cohortStart = startOfCohortBucket(user.createdAt, cohortMode);
      const key = cohortBucketKey(cohortStart);
      const activitySet = activityByUser.get(user._id.toString()) ?? new Set<string>();
      const lastActiveBucket = user.lastActiveAt
        ? cohortBucketKey(startOfCohortBucket(user.lastActiveAt, cohortMode))
        : null;
      const entry = cohorts.get(key) ?? {
        cohortStart,
        cohortSize: 0,
        retained1: 0,
        retained2: 0,
        retained3: 0,
      };

      entry.cohortSize += 1;

      for (let offset = 1; offset <= 3; offset += 1) {
        const targetKey = cohortBucketKey(addCohortBuckets(cohortStart, cohortMode, offset));
        const retained = activitySet.has(targetKey) || lastActiveBucket === targetKey;

        if (!retained) {
          continue;
        }

        if (offset === 1) {
          entry.retained1 += 1;
        }
        if (offset === 2) {
          entry.retained2 += 1;
        }
        if (offset === 3) {
          entry.retained3 += 1;
        }
      }

      cohorts.set(key, entry);
    }

    return {
      mode: 'simplified',
      label: 'Simplified retention',
      cohort: cohortMode,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      cohorts: Array.from(cohorts.values())
        .sort((left, right) => left.cohortStart.getTime() - right.cohortStart.getTime())
        .map((entry) => ({
          cohortStart: entry.cohortStart.toISOString(),
          cohortSize: entry.cohortSize,
          retained_1: entry.retained1,
          retained_2: entry.retained2,
          retained_3: entry.retained3,
          retainedRates: {
            retained_1: entry.cohortSize > 0 ? entry.retained1 / entry.cohortSize : 0,
            retained_2: entry.cohortSize > 0 ? entry.retained2 / entry.cohortSize : 0,
            retained_3: entry.cohortSize > 0 ? entry.retained3 / entry.cohortSize : 0,
          },
        })),
    };
  });

  app.get('/admin/notifications/tokens', { preHandler: requireAdmin }, async (request) => {
    const query = parseQuery(notificationTokensQuerySchema, request.query);
    const filter: Record<string, unknown> = {
      role: { $ne: 'admin' },
    };

    if (typeof query.hasToken === 'boolean') {
      filter['expoPushTokens.0'] = {
        $exists: query.hasToken,
      };
    }

    if (query.platform) {
      filter.expoPushTokens = {
        $elemMatch: {
          platform: query.platform,
        },
      };
    }

    const [summaryRows, total, users] = await Promise.all([
      UserModel.aggregate<{
        totalUsers: number;
        usersWithTokens: number;
        usersMissingTokens: number;
        iosTokens: number;
        androidTokens: number;
      }>([
        {
          $match: {
            role: { $ne: 'admin' },
          },
        },
        {
          $project: {
            tokens: { $ifNull: ['$expoPushTokens', []] },
          },
        },
        {
          $project: {
            tokensCount: { $size: '$tokens' },
            iosTokens: {
              $size: {
                $filter: {
                  input: '$tokens',
                  as: 'token',
                  cond: { $eq: ['$$token.platform', 'ios'] },
                },
              },
            },
            androidTokens: {
              $size: {
                $filter: {
                  input: '$tokens',
                  as: 'token',
                  cond: { $eq: ['$$token.platform', 'android'] },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            usersWithTokens: {
              $sum: {
                $cond: [{ $gt: ['$tokensCount', 0] }, 1, 0],
              },
            },
            usersMissingTokens: {
              $sum: {
                $cond: [{ $eq: ['$tokensCount', 0] }, 1, 0],
              },
            },
            iosTokens: { $sum: '$iosTokens' },
            androidTokens: { $sum: '$androidTokens' },
          },
        },
        {
          $project: {
            _id: 0,
            totalUsers: 1,
            usersWithTokens: 1,
            usersMissingTokens: 1,
            iosTokens: 1,
            androidTokens: 1,
          },
        },
      ]),
      UserModel.countDocuments(filter),
      UserModel.find(filter)
        .select('_id email name expoPushTokens')
        .sort({ updatedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean<
          Array<{
            _id: Types.ObjectId;
            email: string;
            name?: string | null;
            expoPushTokens?: SafeExpoPushTokenMeta[];
          }>
        >(),
    ]);

    const summary = summaryRows[0] ?? {
      totalUsers: 0,
      usersWithTokens: 0,
      usersMissingTokens: 0,
      iosTokens: 0,
      androidTokens: 0,
    };

    return {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total > 0 ? Math.ceil(total / query.limit) : 0,
      summary: {
        totalUsers: summary.totalUsers,
        usersWithTokens: summary.usersWithTokens,
        usersMissingTokens: summary.usersMissingTokens,
        platformSplit: {
          ios: summary.iosTokens,
          android: summary.androidTokens,
        },
      },
      users: users.map((user) => {
        const tokenMeta = toSafeTokenMeta(user.expoPushTokens);

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? null,
          tokensCount: tokenMeta.count,
          lastUpdatedAt: tokenMeta.lastUpdatedAt,
          platformSplit: tokenMeta.platformSplit,
        };
      }),
    };
  });

  app.post('/admin/notifications/send', { preHandler: requireAdmin }, async (request) => {
    const input = parseBody(adminNotificationSendBodySchema, request.body);
    const filter: Record<string, unknown> = {
      role: { $ne: 'admin' },
    };

    if (input.target === 'hasToken') {
      filter['expoPushTokens.0'] = {
        $exists: true,
      };
    }

    if (input.target === 'users') {
      const uniqueUserIds = Array.from(new Set(input.userIds ?? [])).filter((value) => Types.ObjectId.isValid(value));

      filter._id = {
        $in: uniqueUserIds.map((value) => new Types.ObjectId(value)),
      };
    }

    const users = await UserModel.find(filter)
      .select('_id expoPushTokens')
      .lean<
        Array<{
          _id: Types.ObjectId;
          expoPushTokens?: Array<{
            token?: string | null;
          }>;
        }>
      >();

    let noToken = 0;
    const validTokens: string[] = [];

    for (const user of users) {
      const tokens = Array.from(
        new Set(
          (user.expoPushTokens ?? [])
            .map((entry) => (typeof entry.token === 'string' ? entry.token.trim() : ''))
            .filter((token) => token.length > 0 && isExpoPushToken(token)),
        ),
      );

      if (tokens.length === 0) {
        noToken += 1;
        continue;
      }

      validTokens.push(...tokens);
    }

    const sent = await sendExpoPushNotifications(validTokens, {
      title: input.title,
      body: input.body,
    });

    return {
      targeted: users.length,
      sent,
      noToken,
    };
  });
}
