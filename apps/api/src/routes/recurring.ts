import {
  logoutResponseSchema,
  recurringCreateInputSchema,
  recurringListQuerySchema,
  recurringListResponseSchema,
  recurringRuleSchema,
  recurringRunDueResponseSchema,
  recurringUpdateInputSchema,
  type RecurringCreateInput,
  type RecurringListQuery,
  type RecurringRule,
  type RecurringUpdateInput,
} from '@finsight/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FilterQuery, Types } from 'mongoose';

import { authenticate } from '../auth/middleware.js';
import { getConfig } from '../config.js';
import { ApiError } from '../errors.js';
import {
  createNormalTransaction,
  createTransferPair,
  resolveActiveAccount,
  resolveActiveCategory,
  validateTransactionType,
} from '../lib/ledger.js';
import { getMonthBoundaries } from '../lib/month.js';
import { RecurringRunLogModel } from '../models/RecurringRunLog.js';
import { RecurringRuleModel, type RecurringRuleDocument } from '../models/RecurringRule.js';

import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';

function toRecurringDto(rule: RecurringRuleDocument): RecurringRule {
  const stamped = rule as RecurringRuleDocument & { createdAt: Date; updatedAt: Date };

  return {
    id: rule.id,
    kind: rule.kind,
    accountId: rule.accountId ? rule.accountId.toString() : null,
    categoryId: rule.categoryId ? rule.categoryId.toString() : null,
    type: rule.type ?? null,
    fromAccountId: rule.fromAccountId ? rule.fromAccountId.toString() : null,
    toAccountId: rule.toAccountId ? rule.toAccountId.toString() : null,
    amount: rule.amount,
    description: rule.description ?? null,
    cadence: rule.cadence,
    dayOfWeek: rule.dayOfWeek ?? null,
    dayOfMonth: rule.dayOfMonth ?? null,
    startAt: rule.startAt.toISOString(),
    endAt: rule.endAt ? rule.endAt.toISOString() : null,
    nextRunAt: rule.nextRunAt.toISOString(),
    lastRunAt: rule.lastRunAt ? rule.lastRunAt.toISOString() : null,
    isPaused: rule.isPaused,
    deletedAt: rule.deletedAt ? rule.deletedAt.toISOString() : null,
    createdAt: stamped.createdAt.toISOString(),
    updatedAt: stamped.updatedAt.toISOString(),
  };
}

function ensureScheduleFields(
  cadence: 'weekly' | 'monthly',
  dayOfWeek: number | null | undefined,
  dayOfMonth: number | null | undefined,
): void {
  if (cadence === 'weekly' && (dayOfWeek === null || dayOfWeek === undefined)) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: '`dayOfWeek` is required for weekly cadence',
      statusCode: 400,
    });
  }

  if (cadence === 'monthly' && (dayOfMonth === null || dayOfMonth === undefined)) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: '`dayOfMonth` is required for monthly cadence',
      statusCode: 400,
    });
  }
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

function calculateInitialNextRun(
  cadence: 'weekly' | 'monthly',
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  startAt: Date,
): Date {
  ensureScheduleFields(cadence, dayOfWeek, dayOfMonth);

  if (cadence === 'weekly') {
    const targetDow = dayOfWeek as number;
    const candidate = new Date(startAt);
    const diff = (targetDow - candidate.getUTCDay() + 7) % 7;
    candidate.setUTCDate(candidate.getUTCDate() + diff);

    if (candidate.getTime() < startAt.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 7);
    }

    return candidate;
  }

  const targetDom = dayOfMonth as number;
  let candidate = scheduleAtDay(startAt.getUTCFullYear(), startAt.getUTCMonth(), targetDom, startAt);

  if (candidate.getTime() < startAt.getTime()) {
    candidate = scheduleAtDay(
      startAt.getUTCFullYear(),
      startAt.getUTCMonth() + 1,
      targetDom,
      startAt,
    );
  }

  return candidate;
}

function advanceNextRun(
  current: Date,
  cadence: 'weekly' | 'monthly',
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): Date {
  ensureScheduleFields(cadence, dayOfWeek, dayOfMonth);

  if (cadence === 'weekly') {
    const next = new Date(current);
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  const targetDom = dayOfMonth as number;
  return scheduleAtDay(current.getUTCFullYear(), current.getUTCMonth() + 1, targetDom, current);
}

function calculateNextFromNow(rule: RecurringRuleDocument): Date {
  const now = new Date();
  let candidate = calculateInitialNextRun(
    rule.cadence,
    rule.dayOfWeek ?? null,
    rule.dayOfMonth ?? null,
    now,
  );

  // Keep advancing until next slot is strictly in the future.
  while (candidate.getTime() <= now.getTime()) {
    candidate = advanceNextRun(
      candidate,
      rule.cadence,
      rule.dayOfWeek ?? null,
      rule.dayOfMonth ?? null,
    );
  }

  return candidate;
}

async function executeRecurringRun(
  rule: RecurringRuleDocument,
  scheduledFor: Date,
): Promise<Types.ObjectId[]> {
  if (rule.kind === 'normal') {
    if (!rule.accountId || !rule.categoryId || !rule.type) {
      throw new ApiError({
        code: 'RECURRING_RULE_INVALID',
        message: 'Recurring normal rule is missing account/category/type',
        statusCode: 400,
      });
    }

    const [account, category] = await Promise.all([
      resolveActiveAccount(rule.userId, rule.accountId),
      resolveActiveCategory(rule.userId, rule.categoryId),
    ]);

    validateTransactionType(category.type, rule.type);

    const transaction = await createNormalTransaction({
      userId: rule.userId,
      accountId: account._id,
      categoryId: category._id,
      type: rule.type,
      amount: rule.amount,
      currency: account.currency,
      description: rule.description ?? null,
      occurredAt: scheduledFor,
    });

    return [transaction._id];
  }

  if (!rule.fromAccountId || !rule.toAccountId) {
    throw new ApiError({
      code: 'RECURRING_RULE_INVALID',
      message: 'Recurring transfer rule is missing from/to account',
      statusCode: 400,
    });
  }

  const transfer = await createTransferPair({
    userId: rule.userId,
    fromAccountId: rule.fromAccountId,
    toAccountId: rule.toAccountId,
    amount: rule.amount,
    occurredAt: scheduledFor,
    description: rule.description ?? null,
  });

  return [transfer.fromTransaction._id, transfer.toTransaction._id];
}

function readCronSecret(request: FastifyRequest): string | null {
  const raw = request.headers['x-cron-secret'];
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return typeof raw === 'string' ? raw : null;
}

function readBearerToken(request: FastifyRequest): string | null {
  const raw = request.headers.authorization;
  if (!raw) {
    return null;
  }

  const [scheme, value] = raw.split(' ');
  if (scheme !== 'Bearer' || !value) {
    return null;
  }

  return value;
}

function requireCronAuth(request: FastifyRequest): void {
  const config = getConfig();
  const provided = readCronSecret(request) ?? readBearerToken(request);
  if (provided !== config.cronSecret) {
    throw new ApiError({
      code: 'FORBIDDEN',
      message: 'Invalid cron secret',
      statusCode: 403,
    });
  }
}

export function registerRecurringRoutes(app: FastifyInstance): void {
  app.get('/recurring', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const query = parseQuery<RecurringListQuery>(recurringListQuerySchema, request.query);

    const filter: FilterQuery<RecurringRuleDocument> = {
      userId,
      ...(query.includeDeleted ? {} : { deletedAt: null }),
    };

    if (query.month) {
      const { start, endExclusive } = getMonthBoundaries(query.month, 'month');
      filter.nextRunAt = {
        $gte: start,
        $lt: endExclusive,
      };
    }

    const rules = await RecurringRuleModel.find(filter).sort({ nextRunAt: 1, _id: -1 });

    return recurringListResponseSchema.parse({
      rules: rules.map((rule) => toRecurringDto(rule)),
    });
  });

  app.post('/recurring', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const input = parseBody<RecurringCreateInput>(recurringCreateInputSchema, request.body);

    if (input.kind === 'normal') {
      const account = await resolveActiveAccount(userId, parseObjectId(input.accountId, 'accountId'));
      const category = await resolveActiveCategory(userId, parseObjectId(input.categoryId, 'categoryId'));
      validateTransactionType(category.type, input.type);
      if (account.deletedAt !== null) {
        throw new ApiError({
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Account not found',
          statusCode: 404,
        });
      }
    } else {
      if (input.fromAccountId === input.toAccountId) {
        throw new ApiError({
          code: 'TRANSFER_ACCOUNT_CONFLICT',
          message: '`fromAccountId` and `toAccountId` must differ',
          statusCode: 400,
        });
      }

      const [fromAccount, toAccount] = await Promise.all([
        resolveActiveAccount(userId, parseObjectId(input.fromAccountId, 'fromAccountId')),
        resolveActiveAccount(userId, parseObjectId(input.toAccountId, 'toAccountId')),
      ]);

      if (fromAccount.currency !== toAccount.currency) {
        throw new ApiError({
          code: 'TRANSFER_CURRENCY_MISMATCH',
          message: 'Transfer accounts must have matching currencies',
          statusCode: 400,
        });
      }
    }

    const startAt = new Date(input.startAt);
    const nextRunAt = calculateInitialNextRun(
      input.cadence,
      input.dayOfWeek ?? null,
      input.dayOfMonth ?? null,
      startAt,
    );

    const recurringRule = await RecurringRuleModel.create({
      userId,
      kind: input.kind,
      accountId: input.kind === 'normal' ? parseObjectId(input.accountId, 'accountId') : null,
      categoryId: input.kind === 'normal' ? parseObjectId(input.categoryId, 'categoryId') : null,
      type: input.kind === 'normal' ? input.type : null,
      fromAccountId:
        input.kind === 'transfer' ? parseObjectId(input.fromAccountId, 'fromAccountId') : null,
      toAccountId: input.kind === 'transfer' ? parseObjectId(input.toAccountId, 'toAccountId') : null,
      amount: input.amount,
      description: input.description ?? null,
      cadence: input.cadence,
      dayOfWeek: input.dayOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      startAt,
      endAt: input.endAt ? new Date(input.endAt) : null,
      nextRunAt,
      lastRunAt: null,
      isPaused: false,
      deletedAt: null,
    });

    reply.status(201);
    return recurringRuleSchema.parse(toRecurringDto(recurringRule));
  });

  app.patch('/recurring/:id', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const recurringId = parseObjectId((request.params as { id?: string }).id ?? '', 'id');
    const input = parseBody<RecurringUpdateInput>(recurringUpdateInputSchema, request.body);

    const rule = await RecurringRuleModel.findOne({
      _id: recurringId,
      userId,
      deletedAt: null,
    });

    if (!rule) {
      throw new ApiError({
        code: 'RECURRING_RULE_NOT_FOUND',
        message: 'Recurring rule not found',
        statusCode: 404,
      });
    }

    if (input.amount !== undefined) {
      rule.amount = input.amount;
    }
    if (input.description !== undefined) {
      rule.description = input.description && input.description.length > 0 ? input.description : null;
    }
    if (input.endAt !== undefined) {
      rule.endAt = input.endAt ? new Date(input.endAt) : null;
    }
    if (input.isPaused !== undefined) {
      rule.isPaused = input.isPaused;
    }

    const scheduleChanged =
      input.cadence !== undefined || input.dayOfWeek !== undefined || input.dayOfMonth !== undefined;

    if (input.cadence !== undefined) {
      rule.cadence = input.cadence;
    }
    if (input.dayOfWeek !== undefined) {
      rule.dayOfWeek = input.dayOfWeek;
    }
    if (input.dayOfMonth !== undefined) {
      rule.dayOfMonth = input.dayOfMonth;
    }

    ensureScheduleFields(rule.cadence, rule.dayOfWeek, rule.dayOfMonth);

    if (scheduleChanged || (input.isPaused === false && rule.nextRunAt.getTime() <= Date.now())) {
      rule.nextRunAt = calculateNextFromNow(rule);
    }

    if (rule.endAt && rule.nextRunAt.getTime() > rule.endAt.getTime()) {
      rule.isPaused = true;
    }

    await rule.save();

    return recurringRuleSchema.parse(toRecurringDto(rule));
  });

  app.delete('/recurring/:id', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const recurringId = parseObjectId((request.params as { id?: string }).id ?? '', 'id');

    const rule = await RecurringRuleModel.findOne({
      _id: recurringId,
      userId,
      deletedAt: null,
    });

    if (!rule) {
      throw new ApiError({
        code: 'RECURRING_RULE_NOT_FOUND',
        message: 'Recurring rule not found',
        statusCode: 404,
      });
    }

    rule.deletedAt = new Date();
    await rule.save();

    return logoutResponseSchema.parse({ ok: true });
  });

  app.post(
    '/recurring/run-due',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      requireCronAuth(request);

      const now = new Date();
      const dueRules = await RecurringRuleModel.find({
        deletedAt: null,
        isPaused: false,
        nextRunAt: { $lte: now },
      }).sort({ nextRunAt: 1, _id: 1 });

      let processedRules = 0;
      let processedRuns = 0;
      let generatedTransactions = 0;

      for (const rule of dueRules) {
        processedRules += 1;

        let cursor = new Date(rule.nextRunAt);
        let lastRunAt = rule.lastRunAt ? new Date(rule.lastRunAt) : null;
        let shouldPause = rule.isPaused;

        while (!shouldPause && cursor.getTime() <= now.getTime()) {
          if (rule.endAt && cursor.getTime() > rule.endAt.getTime()) {
            shouldPause = true;
            break;
          }

          let logId: Types.ObjectId | null = null;

          try {
            const runLog = await RecurringRunLogModel.create({
              ruleId: rule._id,
              userId: rule.userId,
              scheduledAt: cursor,
              generatedTransactionIds: [],
            });
            logId = runLog._id;
          } catch (error) {
            if ((error as { code?: number }).code === 11000) {
              lastRunAt = new Date(cursor);
              cursor = advanceNextRun(
                cursor,
                rule.cadence,
                rule.dayOfWeek ?? null,
                rule.dayOfMonth ?? null,
              );
              continue;
            }
            throw error;
          }

          try {
            const generatedIds = await executeRecurringRun(rule, cursor);

            await RecurringRunLogModel.updateOne(
              { _id: logId },
              { $set: { generatedTransactionIds: generatedIds } },
            );

            processedRuns += 1;
            generatedTransactions += generatedIds.length;
            lastRunAt = new Date(cursor);
            cursor = advanceNextRun(
              cursor,
              rule.cadence,
              rule.dayOfWeek ?? null,
              rule.dayOfMonth ?? null,
            );
          } catch (error) {
            if (logId) {
              await RecurringRunLogModel.deleteOne({ _id: logId });
            }
            throw error;
          }

          if (rule.endAt && cursor.getTime() > rule.endAt.getTime()) {
            shouldPause = true;
          }
        }

        const hasLastRunChanged =
          (lastRunAt?.getTime() ?? 0) !== (rule.lastRunAt ? rule.lastRunAt.getTime() : 0);

        if (
          cursor.getTime() !== rule.nextRunAt.getTime() ||
          shouldPause !== rule.isPaused ||
          hasLastRunChanged
        ) {
          rule.nextRunAt = cursor;
          rule.isPaused = shouldPause;
          rule.lastRunAt = lastRunAt;
          await rule.save();
        }
      }

      return recurringRunDueResponseSchema.parse({
        processedRules,
        processedRuns,
        generatedTransactions,
      });
    },
  );
}
