import {
  aiInsightsResponseSchema,
  type AiInsightsLanguage,
  type AiInsightsResponse,
  type CategoryType,
  type TransactionType,
} from '@finsight/shared';
import type { Types } from 'mongoose';
import { z } from 'zod';

import { getConfig } from '../config.js';
import { ApiError } from '../errors.js';
import { BudgetModel } from '../models/Budget.js';
import { CategoryModel } from '../models/Category.js';
import { RecurringRuleModel } from '../models/RecurringRule.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const GEMINI_TIMEOUT_MS = 20_000;
const GEMINI_MAX_ATTEMPTS = 3;

const languageNameMap: Record<AiInsightsLanguage, string> = {
  tr: 'Turkish',
  en: 'English',
  ru: 'Russian',
};

const aiProviderOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  topFindings: z.array(z.string().min(1).max(320)).min(1).max(8),
  suggestedActions: z.array(z.string().min(1).max(320)).min(1).max(8),
  warnings: z.array(z.string().min(1).max(320)).max(8),
});

interface CacheEntry {
  expiresAt: number;
  value: AiInsightsResponse;
}

const aiInsightsCache = new Map<string, CacheEntry>();

interface GenerateAiInsightsInput {
  userId: Types.ObjectId;
  from: Date;
  to: Date;
  fromLabel: string;
  toLabel: string;
  language: AiInsightsLanguage;
}

interface PromptPayload {
  period: {
    from: string;
    to: string;
    days: number;
  };
  currency: string | null;
  totals: {
    income: number;
    expense: number;
    net: number;
    transactionCount: number;
  };
  categories: Array<{
    name: string;
    type: CategoryType;
    total: number;
    sharePercent: number;
  }>;
  trendByMonth: Array<{
    month: string;
    income: number;
    expense: number;
    net: number;
  }>;
  biggestTransactions: Array<{
    date: string;
    type: TransactionType;
    amount: number;
    currency: string;
    category: string;
  }>;
  recurring: {
    activeRules: number;
    weeklyRules: number;
    monthlyRules: number;
    transferRules: number;
    upcomingRunsIn30Days: number;
  };
  budgets: Array<{
    month: string;
    category: string;
    limitAmount: number;
    spentAmount: number;
    remainingAmount: number;
    percentUsed: number;
    status: 'on_track' | 'near_limit' | 'over_limit';
  }>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function cleanupExpiredCache(now = Date.now()): void {
  for (const [key, entry] of aiInsightsCache.entries()) {
    if (entry.expiresAt <= now) {
      aiInsightsCache.delete(key);
    }
  }
}

function sanitizeFreeText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b\d{6,}\b/g, '[redacted-number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function toUtcDateOnly(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toMonth(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function buildMonthLabels(from: Date, to: Date): string[] {
  const labels: string[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1, 0, 0, 0, 0));

  while (cursor.getTime() <= end.getTime()) {
    labels.push(toMonth(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  }

  return labels;
}

function parseStrictJsonPayload(text: string): unknown {
  const trimmed = text.trim();

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error('No JSON object in AI response');
    }

    return JSON.parse(objectMatch[0]);
  }
}

function extractTextFromGeminiPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI provider returned empty payload');
  }

  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  const firstText = candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;

  if (!firstText || firstText.trim().length === 0) {
    throw new Error('AI provider returned no text');
  }

  return firstText;
}

function buildPrompt(language: AiInsightsLanguage, payload: PromptPayload): string {
  const targetLanguage = languageNameMap[language];

  return [
    'You are FinSight AI, a conservative personal finance analyst.',
    `Write all output in ${targetLanguage}.`,
    'Do not reveal or infer private identifiers. Never include emails, account numbers, transaction IDs, user IDs, or phone numbers.',
    'Use only the provided aggregate finance data.',
    'Return strict JSON only with this exact shape:',
    '{"summary":"string","topFindings":["string"],"suggestedActions":["string"],"warnings":["string"]}',
    'Constraints:',
    '- summary must be 2-4 sentences',
    '- topFindings must have 3-5 bullet strings',
    '- suggestedActions must have 3-5 practical bullet strings',
    '- warnings can be empty but include only risk-related bullet strings',
    '- avoid markdown and avoid newline prefixes like "-"',
    `Input data JSON: ${JSON.stringify(payload)}`,
  ].join('\n');
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchGeminiWithRetry(
  params: {
    apiKey: string;
    model: string;
    prompt: string;
  },
  fetchImpl: FetchLike,
): Promise<unknown> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  let lastError: unknown;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, GEMINI_TIMEOUT_MS);

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: params.prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return (await response.json()) as unknown;
      }

      const status = response.status;
      const retryable = status === 429 || status >= 500;

      if (!retryable || attempt === GEMINI_MAX_ATTEMPTS) {
        throw new ApiError({
          code: 'AI_PROVIDER_ERROR',
          message: 'AI provider request failed',
          statusCode: 502,
          details: { statusCode: status },
        });
      }

      const backoffMs = 300 * 2 ** (attempt - 1) + Math.floor(Math.random() * 120);
      await sleep(backoffMs);
      continue;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (error instanceof ApiError) {
        throw error;
      }

      const isAbortError =
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'AbortError';

      if (attempt === GEMINI_MAX_ATTEMPTS) {
        throw new ApiError({
          code: isAbortError ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNREACHABLE',
          message: isAbortError ? 'AI provider timed out' : 'AI provider is unreachable',
          statusCode: 503,
        });
      }

      const backoffMs = 300 * 2 ** (attempt - 1) + Math.floor(Math.random() * 120);
      await sleep(backoffMs);
    }
  }

  throw new ApiError({
    code: 'AI_PROVIDER_ERROR',
    message: 'AI provider request failed',
    statusCode: 502,
    details: lastError,
  });
}

export async function generateAiInsights(
  input: GenerateAiInsightsInput,
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<AiInsightsResponse> {
  const config = getConfig();

  if (!config.geminiApiKey) {
    throw new ApiError({
      code: 'AI_SERVICE_NOT_CONFIGURED',
      message: 'AI insights service is not configured',
      statusCode: 503,
    });
  }

  const cacheKey = `${input.userId.toString()}|${input.fromLabel}|${input.toLabel}|${input.language}`;
  cleanupExpiredCache();
  const cached = aiInsightsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const toExclusive = new Date(input.to.getTime() + DAY_MS);
  const monthLabels = buildMonthLabels(input.from, input.to);

  const [userDoc, transactions, recurringRules, budgets] = await Promise.all([
    UserModel.findById(input.userId).select('baseCurrency'),
    TransactionModel.find({
      userId: input.userId,
      deletedAt: null,
      kind: 'normal',
      occurredAt: {
        $gte: input.from,
        $lt: toExclusive,
      },
    }).select('type amount currency categoryId occurredAt'),
    RecurringRuleModel.find({
      userId: input.userId,
      deletedAt: null,
      isPaused: false,
    }).select('kind cadence nextRunAt'),
    BudgetModel.find({
      userId: input.userId,
      deletedAt: null,
      month: { $in: monthLabels },
    }).select('categoryId month limitAmount'),
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
  const monthlyTrend = new Map<string, { income: number; expense: number }>();

  const categoryTotals = new Map<
    string,
    {
      total: number;
      type: CategoryType;
    }
  >();

  const expenseByMonthCategory = new Map<string, number>();

  for (const transaction of transactions) {
    const monthLabel = toMonth(transaction.occurredAt);
    const monthlyTotals = monthlyTrend.get(monthLabel) ?? { income: 0, expense: 0 };

    if (transaction.type === 'income') {
      totalIncome += transaction.amount;
      monthlyTotals.income += transaction.amount;
    } else {
      totalExpense += transaction.amount;
      monthlyTotals.expense += transaction.amount;
    }
    monthlyTrend.set(monthLabel, monthlyTotals);

    const categoryKey = transaction.categoryId?.toString();
    if (categoryKey) {
      const current = categoryTotals.get(categoryKey);
      categoryTotals.set(categoryKey, {
        total: (current?.total ?? 0) + transaction.amount,
        type: transaction.type,
      });

      if (transaction.type === 'expense') {
        const txMonth = toMonth(transaction.occurredAt);
        const monthCategoryKey = `${txMonth}|${categoryKey}`;
        expenseByMonthCategory.set(
          monthCategoryKey,
          (expenseByMonthCategory.get(monthCategoryKey) ?? 0) + transaction.amount,
        );
      }
    }
  }

  const categoryIds = Array.from(categoryTotals.keys());
  const budgetCategoryIds = budgets.map((budget) => budget.categoryId.toString());
  const allCategoryIds = Array.from(new Set([...categoryIds, ...budgetCategoryIds]));

  const categories = allCategoryIds.length
    ? await CategoryModel.find({
        _id: { $in: allCategoryIds },
        deletedAt: null,
        $or: [{ userId: input.userId }, { userId: null }],
      }).select('_id name type')
    : [];

  const categoryMap = new Map(
    categories.map((category) => [
      category.id,
      {
        name: sanitizeFreeText(category.name),
        type: category.type,
      },
    ]),
  );

  const absoluteBiggestTransactions = [...transactions]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((transaction) => ({
      date: toUtcDateOnly(transaction.occurredAt),
      type: transaction.type,
      amount: roundCurrency(transaction.amount),
      currency: transaction.currency,
      category: categoryMap.get(transaction.categoryId?.toString() ?? '')?.name ?? 'Uncategorized',
    }));

  const incomeOrExpenseTotal = {
    income: totalIncome,
    expense: totalExpense,
  };

  const categoriesForPrompt = Array.from(categoryTotals.entries())
    .map(([categoryId, totals]) => {
      const denominator = incomeOrExpenseTotal[totals.type] || 0;
      const sharePercent = denominator > 0 ? (totals.total / denominator) * 100 : 0;

      return {
        name: categoryMap.get(categoryId)?.name ?? 'Uncategorized',
        type: totals.type,
        total: roundCurrency(totals.total),
        sharePercent: roundCurrency(sharePercent),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const now = new Date();
  const nextThirtyDays = new Date(now.getTime() + 30 * DAY_MS);
  const recurringSummary = {
    activeRules: recurringRules.length,
    weeklyRules: recurringRules.filter((rule) => rule.cadence === 'weekly').length,
    monthlyRules: recurringRules.filter((rule) => rule.cadence === 'monthly').length,
    transferRules: recurringRules.filter((rule) => rule.kind === 'transfer').length,
    upcomingRunsIn30Days: recurringRules.filter(
      (rule) => rule.nextRunAt.getTime() >= now.getTime() && rule.nextRunAt.getTime() <= nextThirtyDays.getTime(),
    ).length,
  };

  const budgetUsage = budgets
    .map((budget) => {
      const categoryId = budget.categoryId.toString();
      const spentAmount = expenseByMonthCategory.get(`${budget.month}|${categoryId}`) ?? 0;
      const percentUsed = budget.limitAmount > 0 ? (spentAmount / budget.limitAmount) * 100 : 0;
      const roundedSpent = roundCurrency(spentAmount);
      const roundedLimit = roundCurrency(budget.limitAmount);

      let status: 'on_track' | 'near_limit' | 'over_limit' = 'on_track';
      if (percentUsed >= 100) {
        status = 'over_limit';
      } else if (percentUsed >= 80) {
        status = 'near_limit';
      }

      return {
        month: budget.month,
        category: categoryMap.get(categoryId)?.name ?? 'Uncategorized',
        limitAmount: roundedLimit,
        spentAmount: roundedSpent,
        remainingAmount: roundCurrency(roundedLimit - roundedSpent),
        percentUsed: roundCurrency(percentUsed),
        status,
      };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed)
    .slice(0, 8);

  const trendByMonth = buildMonthLabels(input.from, input.to).map((month) => {
    const totals = monthlyTrend.get(month) ?? { income: 0, expense: 0 };
    return {
      month,
      income: roundCurrency(totals.income),
      expense: roundCurrency(totals.expense),
      net: roundCurrency(totals.income - totals.expense),
    };
  });

  const promptPayload: PromptPayload = {
    period: {
      from: input.fromLabel,
      to: input.toLabel,
      days: Math.max(1, Math.round((input.to.getTime() - input.from.getTime()) / DAY_MS) + 1),
    },
    currency: userDoc.baseCurrency ?? null,
    totals: {
      income: roundCurrency(totalIncome),
      expense: roundCurrency(totalExpense),
      net: roundCurrency(totalIncome - totalExpense),
      transactionCount: transactions.length,
    },
    categories: categoriesForPrompt,
    trendByMonth,
    biggestTransactions: absoluteBiggestTransactions,
    recurring: recurringSummary,
    budgets: budgetUsage,
  };

  const prompt = buildPrompt(input.language, promptPayload);

  const providerPayload = await fetchGeminiWithRetry(
    {
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      prompt,
    },
    fetchImpl,
  );

  const providerText = extractTextFromGeminiPayload(providerPayload);
  const parsedProviderJson = parseStrictJsonPayload(providerText);
  const parsedProviderOutput = aiProviderOutputSchema.parse(parsedProviderJson);

  const result = aiInsightsResponseSchema.parse({
    from: input.fromLabel,
    to: input.toLabel,
    language: input.language,
    currency: userDoc.baseCurrency ?? null,
    summary: parsedProviderOutput.summary,
    topFindings: parsedProviderOutput.topFindings,
    suggestedActions: parsedProviderOutput.suggestedActions,
    warnings: parsedProviderOutput.warnings,
  });

  aiInsightsCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: result,
  });

  return result;
}

export function clearAiInsightsCacheForTests(): void {
  aiInsightsCache.clear();
}
