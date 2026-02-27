import {
  advisorActionBudgetInputSchema,
  advisorActionBudgetResponseSchema,
  advisorActionRecurringInputSchema,
  advisorActionRecurringResponseSchema,
  advisorActionTransferInputSchema,
  advisorActionTransferResponseSchema,
  advisorInsightsQuerySchema,
  recurringRuleSchema,
  type AdvisorActionBudgetInput,
  type AdvisorActionRecurringInput,
  type AdvisorActionTransferInput,
  type AdvisorInsightsQuery,
  type RecurringRule,
} from '@mintly/shared';
import type { FastifyInstance } from 'fastify';

import { authenticate } from '../auth/middleware.js';
import { getConfig } from '../config.js';
import { ApiError } from '../errors.js';
import { generateAdvisorInsight } from '../lib/advisor-insights.js';
import { searchCloudflareModels } from '../lib/ai/cloudflare.js';
import { createTransferPair, resolveActiveAccount, resolveActiveCategory } from '../lib/ledger.js';
import { BudgetModel } from '../models/Budget.js';
import { RecurringRuleModel, type RecurringRuleDocument } from '../models/RecurringRule.js';

import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';

const ADVISOR_INSIGHTS_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ADVISOR_INSIGHTS_RATE_LIMIT_MAX = 8;
const ADVISOR_REGENERATE_COOLDOWN_MS = 15 * 1000;

interface UserRateLimitEntry {
  count: number;
  resetAt: number;
}

interface AdvisorDailyFreeUsageEntry {
  dayKey: string;
  updatedAt: number;
}

const advisorInsightsRateLimitByUser = new Map<string, UserRateLimitEntry>();
const advisorInsightsRegenerateCooldownByUser = new Map<string, number>();
const advisorDailyFreeUsageByUser = new Map<string, AdvisorDailyFreeUsageEntry>();
const ADVISOR_DAILY_FREE_USAGE_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ADVISOR_DAILY_FREE_USAGE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

let lastAdvisorDailyUsageSweepAt = 0;

function getCurrentUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function consumeAdvisorDailyFreeUsage(userId: string): { allowFree: boolean; dayKey: string } {
  const now = Date.now();
  const dayKey = getCurrentUtcDayKey();
  const existing = advisorDailyFreeUsageByUser.get(userId);

  if (!existing || existing.dayKey !== dayKey) {
    advisorDailyFreeUsageByUser.set(userId, {
      dayKey,
      updatedAt: now,
    });
  } else {
    existing.updatedAt = now;
  }

  if (now - lastAdvisorDailyUsageSweepAt >= ADVISOR_DAILY_FREE_USAGE_SWEEP_INTERVAL_MS) {
    lastAdvisorDailyUsageSweepAt = now;

    for (const [key, entry] of advisorDailyFreeUsageByUser.entries()) {
      if (now - entry.updatedAt > ADVISOR_DAILY_FREE_USAGE_RETENTION_MS) {
        advisorDailyFreeUsageByUser.delete(key);
      }
    }
  }

  return {
    allowFree: !existing || existing.dayKey !== dayKey,
    dayKey,
  };
}

function enforceAdvisorInsightsRateLimit(userId: string): void {
  const now = Date.now();
  const existing = advisorInsightsRateLimitByUser.get(userId);

  if (!existing || existing.resetAt <= now) {
    advisorInsightsRateLimitByUser.set(userId, {
      count: 1,
      resetAt: now + ADVISOR_INSIGHTS_RATE_LIMIT_WINDOW_MS,
    });
  } else if (existing.count >= ADVISOR_INSIGHTS_RATE_LIMIT_MAX) {
    throw new ApiError({
      code: 'RATE_LIMITED',
      message: 'Too many advisor insight requests. Please retry in a minute.',
      statusCode: 429,
    });
  } else {
    existing.count += 1;
  }

  if (advisorInsightsRateLimitByUser.size > 500) {
    for (const [key, entry] of advisorInsightsRateLimitByUser.entries()) {
      if (entry.resetAt <= now) {
        advisorInsightsRateLimitByUser.delete(key);
      }
    }
  }
}

function enforceAdvisorRegenerateCooldown(userId: string, regenerate: boolean): void {
  if (!regenerate) {
    return;
  }

  const now = Date.now();
  const lastTriggeredAt = advisorInsightsRegenerateCooldownByUser.get(userId);
  if (lastTriggeredAt !== undefined) {
    const elapsedMs = now - lastTriggeredAt;
    if (elapsedMs < ADVISOR_REGENERATE_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((ADVISOR_REGENERATE_COOLDOWN_MS - elapsedMs) / 1000);
      throw new ApiError({
        code: 'ADVISOR_REGENERATE_COOLDOWN',
        message: 'Please wait before regenerating advisor insights again.',
        statusCode: 429,
        details: { retryAfterSec },
      });
    }
  }

  advisorInsightsRegenerateCooldownByUser.set(userId, now);

  if (advisorInsightsRegenerateCooldownByUser.size > 1000) {
    for (const [key, value] of advisorInsightsRegenerateCooldownByUser.entries()) {
      if (now - value > ADVISOR_REGENERATE_COOLDOWN_MS * 4) {
        advisorInsightsRegenerateCooldownByUser.delete(key);
      }
    }
  }
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

export function registerAdvisorRoutes(app: FastifyInstance): void {
  app.post('/advisor/insights/free-check', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    return consumeAdvisorDailyFreeUsage(user.id);
  });

  app.get('/advisor/insights', { preHandler: authenticate }, async (request) => {
    const startedAt = Date.now();
    const user = requireUser(request);
    enforceAdvisorInsightsRateLimit(user.id);

    const query = parseQuery<AdvisorInsightsQuery>(advisorInsightsQuerySchema, request.query);
    const userId = parseObjectId(user.id, 'userId');
    enforceAdvisorRegenerateCooldown(user.id, query.regenerate);
    const advisorRequestIdHeader = request.headers['x-advisor-request-id'];
    const variantNonceFromHeader = typeof advisorRequestIdHeader === 'string'
      ? advisorRequestIdHeader
      : Array.isArray(advisorRequestIdHeader)
        ? advisorRequestIdHeader[0] ?? null
        : null;
    const variantNonce = query.regenerate
      ? (variantNonceFromHeader && variantNonceFromHeader.trim().length > 0
          ? variantNonceFromHeader
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
      : variantNonceFromHeader;

    try {
      const result = await generateAdvisorInsight({
        userId,
        month: query.month,
        language: query.language,
        regenerate: query.regenerate,
        variantNonce,
        onDiagnostic: (diagnostic) => {
          request.log.info(
            {
              requestId: request.id,
              userId: user.id,
              month: query.month,
              diagnostic,
            },
            'advisor insights diagnostic',
          );
        },
      });

      request.log.info(
        {
          requestId: request.id,
          userId: user.id,
          month: query.month,
          mode: result.mode,
          modeReason: result.modeReason,
          durationMs: Date.now() - startedAt,
        },
        'advisor insights generated',
      );

      return result;
    } catch (error) {
      request.log.error(
        {
          requestId: request.id,
          userId: user.id,
          month: query.month,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : 'unknown',
        },
        'advisor insights failed',
      );
      throw error;
    }
  });

  app.get('/advisor/provider-health', { preHandler: authenticate }, async (request) => {
    const config = getConfig();
    if (config.nodeEnv === 'production') {
      throw new ApiError({
        code: 'NOT_FOUND',
        message: 'Not found',
        statusCode: 404,
      });
    }

    const modelConfigured = Boolean(
      config.advisorProvider === 'cloudflare' &&
      config.cloudflareAuthToken &&
      config.cloudflareAccountId &&
      config.cloudflareAiModel,
    );

    if (!modelConfigured) {
      return {
        ok: false,
        modelConfigured: false,
        modelExists: false,
        latencyMs: null,
      };
    }

    const searchResult = await searchCloudflareModels({
      apiToken: config.cloudflareAuthToken as string,
      accountId: config.cloudflareAccountId as string,
      timeoutMs: config.cloudflareHttpTimeoutMs,
      onDiagnostic: (diagnostic) => {
        request.log.info(
          {
            requestId: request.id,
            diagnostic,
          },
          'advisor provider health diagnostic',
        );
      },
    });

    return {
      ok: true,
      modelConfigured: true,
      modelExists: searchResult.models.includes(config.cloudflareAiModel),
      latencyMs: searchResult.latencyMs,
    };
  });

  app.post('/advisor/actions/budget', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const input = parseBody<AdvisorActionBudgetInput>(advisorActionBudgetInputSchema, request.body);

    let createdCount = 0;
    let updatedCount = 0;
    const budgets: Array<{
      categoryId: string;
      budgetId: string;
      month: string;
      limitAmount: number;
    }> = [];

    for (const item of input.items) {
      const categoryId = parseObjectId(item.categoryId, 'categoryId');
      const category = await resolveActiveCategory(userId, categoryId);

      if (category.type !== 'expense') {
        throw new ApiError({
          code: 'INVALID_BUDGET_CATEGORY',
          message: 'Category must be an expense category',
          statusCode: 400,
        });
      }

      const existing = await BudgetModel.findOne({
        userId,
        categoryId,
        month: input.month,
      });

      if (!existing) {
        const created = await BudgetModel.create({
          userId,
          categoryId,
          month: input.month,
          limitAmount: item.limitAmount,
          deletedAt: null,
        });

        createdCount += 1;
        budgets.push({
          categoryId: categoryId.toString(),
          budgetId: created.id,
          month: created.month,
          limitAmount: created.limitAmount,
        });
        continue;
      }

      existing.limitAmount = item.limitAmount;
      existing.deletedAt = null;
      await existing.save();

      updatedCount += 1;
      budgets.push({
        categoryId: categoryId.toString(),
        budgetId: existing.id,
        month: existing.month,
        limitAmount: existing.limitAmount,
      });
    }

    return advisorActionBudgetResponseSchema.parse({
      createdCount,
      updatedCount,
      budgets,
    });
  });

  app.post('/advisor/actions/recurring', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const input = parseBody<AdvisorActionRecurringInput>(advisorActionRecurringInputSchema, request.body);

    const accountId = parseObjectId(input.accountId, 'accountId');
    const categoryId = parseObjectId(input.categoryId, 'categoryId');

    const [account, category] = await Promise.all([
      resolveActiveAccount(userId, accountId),
      resolveActiveCategory(userId, categoryId),
    ]);

    if (category.type !== 'expense') {
      throw new ApiError({
        code: 'CATEGORY_TYPE_MISMATCH',
        message: 'Recurring advisor action requires an expense category',
        statusCode: 400,
      });
    }

    const startAt = input.startAt ? new Date(input.startAt) : new Date();
    const dayOfWeek = input.cadence === 'weekly'
      ? (input.dayOfWeek ?? startAt.getUTCDay())
      : null;
    const dayOfMonth = input.cadence === 'monthly'
      ? (input.dayOfMonth ?? Math.min(28, startAt.getUTCDate()))
      : null;

    const recurringRule = await RecurringRuleModel.create({
      userId,
      kind: 'normal',
      accountId: account._id,
      categoryId: category._id,
      type: 'expense',
      fromAccountId: null,
      toAccountId: null,
      amount: input.amount,
      description: input.description ?? null,
      cadence: input.cadence,
      dayOfWeek,
      dayOfMonth,
      startAt,
      endAt: null,
      nextRunAt: calculateInitialNextRun(input.cadence, dayOfWeek, dayOfMonth, startAt),
      lastRunAt: null,
      isPaused: input.isPaused,
      deletedAt: null,
    });

    reply.status(201);
    return advisorActionRecurringResponseSchema.parse({
      rule: recurringRuleSchema.parse(toRecurringDto(recurringRule)),
    });
  });

  app.post('/advisor/actions/transfer', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const input = parseBody<AdvisorActionTransferInput>(advisorActionTransferInputSchema, request.body);

    const result = await createTransferPair({
      userId,
      fromAccountId: parseObjectId(input.fromAccountId, 'fromAccountId'),
      toAccountId: parseObjectId(input.toAccountId, 'toAccountId'),
      amount: input.amount,
      occurredAt: new Date(input.occurredAt),
      description: input.description ?? null,
    });

    reply.status(201);
    return advisorActionTransferResponseSchema.parse({
      groupId: result.groupId.toString(),
      fromTransactionId: result.fromTransaction.id,
      toTransactionId: result.toTransaction.id,
    });
  });
}
