import {
  advisorInsightSchema,
  type AiInsightsLanguage,
  type AdvisorInsight,
  type RiskProfile,
} from '@mintly/shared';
import type { Types } from 'mongoose';
import { z } from 'zod';

import { getConfig } from '../config.js';
import { ApiError } from '../errors.js';
import {
  CloudflareProviderError,
  generateCloudflareText,
} from './ai/cloudflare.js';
import { getMonthBoundaries } from './month.js';
import { AccountModel } from '../models/Account.js';
import { BudgetModel } from '../models/Budget.js';
import { CategoryModel } from '../models/Category.js';
import { RecurringRuleModel } from '../models/RecurringRule.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const languageNameMap: Record<AiInsightsLanguage, string> = {
  tr: 'Turkish',
  en: 'English',
  ru: 'Russian',
};

const providerOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  savings: z.object({
    targetRate: z.number().min(0).max(1),
    monthlyTargetAmount: z.number().min(0),
    next7DaysActions: z.array(z.string().min(1).max(320)).min(1).max(8),
    autoTransferSuggestion: z.string().min(1).max(320),
  }),
  investment: z.object({
    profiles: z.array(z.object({
      level: z.enum(['low', 'medium', 'high']),
      title: z.string().min(1).max(180),
      rationale: z.string().min(1).max(400),
      options: z.array(z.string().min(1).max(260)).min(1).max(6),
    })).min(1).max(3),
    guidance: z.array(z.string().min(1).max(320)).min(1).max(8),
  }),
  expenseOptimization: z.object({
    cutCandidates: z.array(z.object({
      label: z.string().min(1).max(120),
      suggestedReductionPercent: z.number().min(0).max(100),
      alternativeAction: z.string().min(1).max(320),
    })).min(1).max(6),
    quickWins: z.array(z.string().min(1).max(320)).min(1).max(8),
  }),
  tips: z.array(z.string().min(1).max(320)).min(1).max(10),
});

type ProviderOutput = z.infer<typeof providerOutputSchema>;
function describeZodIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'output';
  return `${path}: ${issue.message}`;
}

function coerceStringArray(value: unknown): unknown {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return [];

    // Bullet / line formatlarını array'e çevir.
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
      .filter((line) => line.length > 0);

    return lines.length > 0 ? lines : [trimmed];
  }

  return value;
}

function coerceProviderOutputShape(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return candidate;
  }

  const root = candidate as Record<string, unknown>;

  // savings.next7DaysActions
  if (root.savings && typeof root.savings === 'object' && !Array.isArray(root.savings)) {
    const savings = root.savings as Record<string, unknown>;
    savings.next7DaysActions = coerceStringArray(savings.next7DaysActions);
  }

  // investment.guidance, investment.profiles, profiles.options
  if (root.investment && typeof root.investment === 'object' && !Array.isArray(root.investment)) {
    const investment = root.investment as Record<string, unknown>;
    investment.guidance = coerceStringArray(investment.guidance);

    if (investment.profiles && !Array.isArray(investment.profiles) && typeof investment.profiles === 'object') {
      investment.profiles = [investment.profiles];
    }

    if (Array.isArray(investment.profiles)) {
      investment.profiles = investment.profiles.map((profile) => {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return profile;
        const p = profile as Record<string, unknown>;
        p.options = coerceStringArray(p.options);
        return p;
      });
    }
  }

  // expenseOptimization.quickWins
  if (root.expenseOptimization && typeof root.expenseOptimization === 'object' && !Array.isArray(root.expenseOptimization)) {
    const expenseOpt = root.expenseOptimization as Record<string, unknown>;
    expenseOpt.quickWins = coerceStringArray(expenseOpt.quickWins);
  }

  // tips
  root.tips = coerceStringArray(root.tips);

  return root;
}
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface GenerateAdvisorInsightInput {
  userId: Types.ObjectId;
  month: string;
  language: AiInsightsLanguage;
  regenerate?: boolean;
  onDiagnostic?: (event: AdvisorInsightDiagnosticEvent) => void;
}

interface PromptPayload {
  month: string;
  language: AiInsightsLanguage;
  currency: string | null;
  preferences: {
    savingsTargetRate: number;
    riskProfile: RiskProfile;
  };
  balancesSnapshot: {
    accountCount: number;
    totalBalance: number;
  };
  spendOverview: {
    last30DaysIncome: number;
    last30DaysExpense: number;
    last30DaysNet: number;
    currentMonthIncome: number;
    currentMonthExpense: number;
    currentMonthNet: number;
    savingsRate: number;
  };
  categoryBreakdown: Array<{
    name: string;
    total: number;
    sharePercent: number;
  }>;
  cashflowTrend: Array<{
    month: string;
    incomeTotal: number;
    expenseTotal: number;
    netTotal: number;
  }>;
  budgetAdherence: {
    trackedCount: number;
    onTrackCount: number;
    nearLimitCount: number;
    overLimitCount: number;
    items: Array<{
      categoryName: string;
      limitAmount: number;
      spentAmount: number;
      remainingAmount: number;
      percentUsed: number;
      status: 'on_track' | 'near_limit' | 'over_limit';
    }>;
  };
  recurringOutflows: {
    rules: Array<{
      label: string;
      cadence: 'weekly' | 'monthly';
      amount: number;
    }>;
    merchants: Array<{
      label: string;
      total: number;
      count: number;
    }>;
  };
  flags: {
    overspendingCategoryNames: string[];
    negativeCashflow: boolean;
    lowSavingsRate: boolean;
    irregularIncome: boolean;
  };
}

interface FallbackCopy {
  summary: string;
  savingsActions: string[];
  autoTransfer: string;
  investmentGuidance: string[];
  tips: string[];
  quickWins: string[];
  lowRiskTitle: string;
  lowRiskRationale: string;
  lowRiskOptions: string[];
  mediumRiskTitle: string;
  mediumRiskRationale: string;
  mediumRiskOptions: string[];
  highRiskTitle: string;
  highRiskRationale: string;
  highRiskOptions: string[];
}

type FallbackReason =
  | 'missing_api_key'
  | 'provider_timeout'
  | 'provider_http_error'
  | 'provider_parse_error'
  | 'provider_validation_error'
  | 'provider_unknown_error';

type ProviderDiagnosticStage =
  | 'provider_config'
  | 'provider_attempt'
  | 'provider_request'
  | 'provider_response'
  | 'provider_response_body'
  | 'provider_request_invalid'
  | 'provider_error'
  | 'provider_health'
  | 'fallback';

interface AdvisorInsightDiagnosticEvent {
  stage: ProviderDiagnosticStage;
  attempt?: number;
  durationMs?: number;
  provider?: 'cloudflare';
  keyConfigured?: boolean;
  endpointBase?: string;
  model?: string;
  status?: number;
  ok?: boolean;
  cfRay?: string | null;
  errorCode?: string;
  payloadKeys?: string[];
  retryAfterSec?: number | null;
  responseShape?: string;
  reason?: string;
  detail?: string;
}

interface CacheEntry {
  expiresAt: number;
  value: AdvisorInsight;
}

const advisorInsightsCache = new Map<string, CacheEntry>();

const fallbackCopyByLanguage: Record<AiInsightsLanguage, FallbackCopy> = {
  en: {
    summary: 'Your monthly view is ready. Keep your cashflow positive, protect an emergency buffer, and optimize recurring expenses first.',
    savingsActions: [
      'Review discretionary expenses and set one weekly cap.',
      'Transfer savings right after income lands to avoid drift.',
      'Delay one non-essential purchase this week.',
    ],
    autoTransfer: 'Set an automatic transfer after each salary date toward your savings account.',
    investmentGuidance: [
      'Build emergency reserves before taking higher volatility.',
      'Diversify and invest with fixed intervals instead of timing the market.',
      'Re-check your allocation once per month.',
    ],
    tips: [
      'Use weekly check-ins to catch overspending early.',
      'Prefer fixed bills negotiation before cutting essentials.',
      'Track one category deeply each month for better control.',
    ],
    quickWins: [
      'Pause one subscription you did not use this month.',
      'Batch grocery shopping once per week.',
      'Set transport spending alerts.',
    ],
    lowRiskTitle: 'Low Risk Path',
    lowRiskRationale: 'Preserve capital with high liquidity and predictable returns.',
    lowRiskOptions: ['Emergency fund account', 'Short-term deposits', 'Low-volatility funds'],
    mediumRiskTitle: 'Balanced Path',
    mediumRiskRationale: 'Balance growth with volatility tolerance over a longer horizon.',
    mediumRiskOptions: ['Broad index funds', 'Bond + equity mix', 'Periodic rebalancing'],
    highRiskTitle: 'Growth Path',
    highRiskRationale: 'Higher upside with larger drawdowns; suitable only with strong reserves.',
    highRiskOptions: ['Higher-equity allocation', 'Sector concentration limits', 'Strict risk limits'],
  },
  tr: {
    summary: 'Aylık görünüm hazır. Nakit akışını pozitif tutup önce acil durum yastığını güçlendir, sonra düzenli giderleri optimize et.',
    savingsActions: [
      'Değişken harcamalara haftalık tavan koy.',
      'Gelir yattığında birikimi otomatik ayır.',
      'Bu hafta zorunlu olmayan bir harcamayı ertele.',
    ],
    autoTransfer: 'Maaş gününden hemen sonra birikim hesabına otomatik transfer tanımla.',
    investmentGuidance: [
      'Yüksek oynaklığa geçmeden önce acil durum birikimini tamamla.',
      'Piyasayı zamanlamak yerine düzenli periyotlarla yatırım yap.',
      'Dağılımını ayda bir kez kontrol et.',
    ],
    tips: [
      'Aşırı harcamayı erken görmek için haftalık kontrol yap.',
      'Temel ihtiyaçları kısmadan önce sabit faturaları pazarlık et.',
      'Her ay bir kategoriyi derin takip et.',
    ],
    quickWins: [
      'Bu ay kullanmadığın bir aboneliği duraklat.',
      'Market alışverişini haftada bir toplu yap.',
      'Ulaşım harcaması için uyarı limiti koy.',
    ],
    lowRiskTitle: 'Düşük Risk Planı',
    lowRiskRationale: 'Sermayeyi koruyup likiditeyi yüksek tutmayı hedefler.',
    lowRiskOptions: ['Acil durum birikim hesabı', 'Kısa vadeli mevduat', 'Düşük oynaklık fonları'],
    mediumRiskTitle: 'Dengeli Plan',
    mediumRiskRationale: 'Uzun vadede büyüme ve dalgalanma arasında denge kurar.',
    mediumRiskOptions: ['Geniş endeks fonları', 'Tahvil + hisse dengesi', 'Periyodik dengeleme'],
    highRiskTitle: 'Büyüme Planı',
    highRiskRationale: 'Yüksek getiri potansiyeli karşılığında daha büyük dalgalanma içerir.',
    highRiskOptions: ['Daha yüksek hisse ağırlığı', 'Sektör yoğunluğu sınırı', 'Sıkı risk limitleri'],
  },
  ru: {
    summary: 'Месячный анализ готов. Сначала стабилизируйте денежный поток и резерв, затем оптимизируйте регулярные расходы.',
    savingsActions: [
      'Установите недельный лимит на необязательные траты.',
      'Автоматически откладывайте деньги сразу после поступления дохода.',
      'Отложите одну необязательную покупку на эту неделю.',
    ],
    autoTransfer: 'Настройте автоперевод в сбережения сразу после дня поступления зарплаты.',
    investmentGuidance: [
      'Сначала сформируйте резервный фонд перед ростом риска.',
      'Инвестируйте регулярно, а не пытайтесь угадывать рынок.',
      'Проверяйте распределение активов раз в месяц.',
    ],
    tips: [
      'Проводите еженедельный контроль расходов.',
      'Сначала оптимизируйте фиксированные платежи, затем переменные траты.',
      'Каждый месяц детально анализируйте одну категорию.',
    ],
    quickWins: [
      'Отключите одну подписку, которой не пользовались в этом месяце.',
      'Покупайте продукты одним крупным походом в неделю.',
      'Поставьте лимиты-уведомления на транспорт.',
    ],
    lowRiskTitle: 'Консервативный профиль',
    lowRiskRationale: 'Сохранение капитала и высокая ликвидность.',
    lowRiskOptions: ['Резервный счет', 'Краткосрочные депозиты', 'Фонды с низкой волатильностью'],
    mediumRiskTitle: 'Сбалансированный профиль',
    mediumRiskRationale: 'Баланс между ростом и риском на длинном горизонте.',
    mediumRiskOptions: ['Широкие индексные фонды', 'Смесь облигаций и акций', 'Периодическая ребалансировка'],
    highRiskTitle: 'Агрессивный профиль',
    highRiskRationale: 'Выше потенциал доходности, но выше просадки.',
    highRiskOptions: ['Более высокая доля акций', 'Ограничение концентрации по секторам', 'Жесткие риск-лимиты'],
  },
};

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shiftMonth(month: string, delta: number): string {
  const [yearRaw, monthRaw] = month.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const date = new Date(Date.UTC(year, monthIndex + delta, 1, 0, 0, 0, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toMonth(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toDateOnlyUtc(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function sanitizeFreeText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b\d{5,}\b/g, '[redacted-number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function previewAiOutput(value: string, maxLen = 420): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  // Redact obvious PII-ish bits (email / long numbers) and cap length.
  const redacted = sanitizeFreeText(trimmed);
  if (redacted.length <= maxLen) {
    return redacted;
  }
  return `${redacted.slice(0, maxLen)}...`;
}

function formatZodIssues(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) {
    return 'unknown validation error';
  }
  const path = first.path.length > 0 ? first.path.join('.') : 'root';
  return `${path}: ${first.message}`;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveAnchorDate(monthEndExclusive: Date): Date {
  const monthLastDate = new Date(monthEndExclusive.getTime() - DAY_MS);
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  if (todayUtc.getTime() > monthLastDate.getTime()) {
    return monthLastDate;
  }

  return todayUtc;
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
      throw new Error('No JSON object found');
    }

    return JSON.parse(objectMatch[0]);
  }
}

function mapCloudflareErrorToFallbackReason(error: CloudflareProviderError): FallbackReason {
  if (error.reason === 'timeout') {
    return 'provider_timeout';
  }

  if (error.reason === 'response_parse_error' || error.reason === 'response_shape_error') {
    return 'provider_parse_error';
  }

  if (error.reason === 'rate_limited' || error.reason === 'http_error') {
    return 'provider_http_error';
  }

  return 'provider_unknown_error';
}

function cleanupExpiredCache(now = Date.now()): void {
  for (const [key, entry] of advisorInsightsCache.entries()) {
    if (entry.expiresAt <= now) {
      advisorInsightsCache.delete(key);
    }
  }
}

function resolveCurrentAmountFromLabel(
  label: string,
  categoryBreakdown: Array<{ name: string; total: number }>,
  merchantBreakdown: Array<{ label: string; total: number }>,
): number {
  const normalizedLabel = normalizeForMatch(label);

  for (const item of categoryBreakdown) {
    const normalizedCategory = normalizeForMatch(item.name);
    if (
      normalizedCategory === normalizedLabel ||
      normalizedCategory.includes(normalizedLabel) ||
      normalizedLabel.includes(normalizedCategory)
    ) {
      return roundCurrency(item.total);
    }
  }

  for (const merchant of merchantBreakdown) {
    const normalizedMerchant = normalizeForMatch(merchant.label);
    if (
      normalizedMerchant === normalizedLabel ||
      normalizedMerchant.includes(normalizedLabel) ||
      normalizedLabel.includes(normalizedMerchant)
    ) {
      return roundCurrency(merchant.total);
    }
  }

  return 0;
}

function buildPrompt(language: AiInsightsLanguage, payload: PromptPayload): string {
  const languageName = languageNameMap[language];

  return [
    'You are Mintly AI, a conservative personal finance advisor.',
    `Write all narrative text in ${languageName}.`,
    'Use only the provided aggregate and anonymized data.',
    'Do not include private identifiers, account numbers, emails, transaction IDs, or user IDs.',
    'Return strict JSON only with this exact shape:',
    JSON.stringify({
      summary: 'string',
      savings: {
        targetRate: 0.2,
        monthlyTargetAmount: 0,
        next7DaysActions: ['string'],
        autoTransferSuggestion: 'string',
      },
      investment: {
        profiles: [
          {
            level: 'low',
            title: 'string',
            rationale: 'string',
            options: ['string'],
          },
        ],
        guidance: ['string'],
      },
      expenseOptimization: {
        cutCandidates: [
          {
            label: 'string',
            suggestedReductionPercent: 15,
            alternativeAction: 'string',
          },
        ],
        quickWins: ['string'],
      },
      tips: ['string'],
    }),
    'Rules:',
    '- summary: 2-4 sentences',
    '- savings.next7DaysActions: 3-5 actionable bullets',
    '- investment.profiles: include low, medium, and high risk profiles if possible',
    '- expenseOptimization.cutCandidates: choose realistic top 3 categories or merchants',
    '- reflect preferred savings target rate and preferred risk profile in recommendations',
    '- keep concise and practical',
    '- IMPORTANT: every list field must be a JSON array (never a single string).',
'- Do not wrap the JSON in markdown fences.',
    `Input JSON: ${JSON.stringify(payload)}`,
  ].join('\n');
}

function buildFallbackAdvice(params: {
  language: AiInsightsLanguage;
  currentMonthIncome: number;
  currentMonthExpense: number;
  currentMonthNet: number;
  savingsRate: number;
  totalBalance: number;
  categoryBreakdown: Array<{ name: string; total: number }>;
  preferredSavingsTargetRate: number;
  preferredRiskProfile: RiskProfile;
}): ProviderOutput {
  const copy = fallbackCopyByLanguage[params.language];
  const targetRate = clamp(params.preferredSavingsTargetRate / 100, 0, 1);
  const monthlyTargetAmount = roundCurrency(Math.max(0, params.currentMonthIncome * targetRate));

  const fallbackCategories = params.categoryBreakdown.slice(0, 3);
  const cutCandidates = fallbackCategories.length > 0
    ? fallbackCategories.map((item) => ({
        label: item.name,
        suggestedReductionPercent: item.total > 0 ? 12 : 8,
        alternativeAction: copy.quickWins[0],
      }))
    : [
        {
          label: copy.quickWins[1],
          suggestedReductionPercent: 10,
          alternativeAction: copy.quickWins[2],
        },
      ];

  const emergencyFundCurrent = Math.max(0, params.totalBalance);
  const orderedProfiles = [
    {
      level: 'low' as const,
      title: copy.lowRiskTitle,
      rationale: copy.lowRiskRationale,
      options: copy.lowRiskOptions,
    },
    {
      level: 'medium' as const,
      title: copy.mediumRiskTitle,
      rationale: copy.mediumRiskRationale,
      options: copy.mediumRiskOptions,
    },
    {
      level: 'high' as const,
      title: copy.highRiskTitle,
      rationale: copy.highRiskRationale,
      options: copy.highRiskOptions,
    },
  ].sort((a, b) => {
    if (a.level === params.preferredRiskProfile) {
      return -1;
    }
    if (b.level === params.preferredRiskProfile) {
      return 1;
    }
    return 0;
  });

  return {
    summary: copy.summary,
    savings: {
      targetRate,
      monthlyTargetAmount,
      next7DaysActions: copy.savingsActions,
      autoTransferSuggestion: copy.autoTransfer,
    },
    investment: {
      profiles: orderedProfiles,
      guidance: [
        ...copy.investmentGuidance,
        emergencyFundCurrent > 0 ? copy.tips[0] : copy.tips[1],
      ],
    },
    expenseOptimization: {
      cutCandidates,
      quickWins: copy.quickWins,
    },
    tips: copy.tips,
  };
}

export async function generateAdvisorInsight(
  input: GenerateAdvisorInsightInput,
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<AdvisorInsight> {
  const config = getConfig();
  const cloudflareConfigured = config.advisorProvider === 'cloudflare'
    && Boolean(config.cloudflareAuthToken && config.cloudflareAccountId);
  input.onDiagnostic?.({
    stage: 'provider_config',
    provider: 'cloudflare',
    keyConfigured: cloudflareConfigured,
    endpointBase: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL}',
    model: config.cloudflareAiModel,
  });

  const userDoc = await UserModel.findById(input.userId)
    .select('baseCurrency savingsTargetRate riskProfile');
  const preferredSavingsTargetRate = userDoc?.savingsTargetRate ?? 20;
  const preferredRiskProfile = (userDoc?.riskProfile ?? 'medium') as RiskProfile;
  const cacheKey = `${input.userId.toString()}|${input.month}|${input.language}`;

  const monthBounds = getMonthBoundaries(input.month, 'month');
  const trendMonths = [
    shiftMonth(input.month, -2),
    shiftMonth(input.month, -1),
    input.month,
  ];
  const trendStart = getMonthBoundaries(trendMonths[0], 'trendStart').start;

  const anchorDate = resolveAnchorDate(monthBounds.endExclusive);
  const last30From = new Date(anchorDate.getTime() - (30 - 1) * DAY_MS);
  const last30ToExclusive = new Date(anchorDate.getTime() + DAY_MS);

  cleanupExpiredCache();

  if (!input.regenerate) {
    const cached = advisorInsightsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const [accounts, transactions, budgets, recurringRules, balanceRows] = await Promise.all([
    AccountModel.find({ userId: input.userId, deletedAt: null }).select('_id name currency'),
    TransactionModel.find({
      userId: input.userId,
      deletedAt: null,
      kind: 'normal',
      occurredAt: {
        $gte: trendStart,
        $lt: monthBounds.endExclusive,
      },
    }).select('type amount currency categoryId occurredAt description'),
    BudgetModel.find({
      userId: input.userId,
      month: input.month,
      deletedAt: null,
    }).select('_id categoryId month limitAmount'),
    RecurringRuleModel.find({
      userId: input.userId,
      deletedAt: null,
      isPaused: false,
      $or: [
        { kind: 'transfer' },
        { kind: 'normal', type: 'expense' },
      ],
    }).select('_id kind cadence amount nextRunAt description categoryId fromAccountId toAccountId'),
    TransactionModel.aggregate<{
      _id: Types.ObjectId;
      balance: number;
    }>([
      {
        $match: {
          userId: input.userId,
          deletedAt: null,
        },
      },
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
  ]);

  const currency = userDoc?.baseCurrency ?? accounts[0]?.currency ?? null;

  const accountNameById = new Map(accounts.map((account) => [account.id, sanitizeFreeText(account.name)]));

  const expenseByCategoryCurrentMonth = new Map<string, number>();
  const currentMonthTotals = { income: 0, expense: 0 };
  const last30Totals = { income: 0, expense: 0 };
  const trendByMonth = new Map<string, { income: number; expense: number }>(
    trendMonths.map((month) => [month, { income: 0, expense: 0 }]),
  );

  const merchantStats = new Map<string, { label: string; total: number; count: number }>();

  const categoryIds = new Set<string>();
  for (const budget of budgets) {
    categoryIds.add(budget.categoryId.toString());
  }

  for (const recurringRule of recurringRules) {
    if (recurringRule.categoryId) {
      categoryIds.add(recurringRule.categoryId.toString());
    }
  }

  for (const transaction of transactions) {
    const txMonth = toMonth(transaction.occurredAt);
    const trendEntry = trendByMonth.get(txMonth);
    if (trendEntry) {
      if (transaction.type === 'income') {
        trendEntry.income += transaction.amount;
      } else {
        trendEntry.expense += transaction.amount;
      }
    }

    if (transaction.categoryId) {
      categoryIds.add(transaction.categoryId.toString());
    }

    const txTime = transaction.occurredAt.getTime();
    const inCurrentMonth = txTime >= monthBounds.start.getTime() && txTime < monthBounds.endExclusive.getTime();
    const inLast30Days = txTime >= last30From.getTime() && txTime < last30ToExclusive.getTime();

    if (inCurrentMonth) {
      if (transaction.type === 'income') {
        currentMonthTotals.income += transaction.amount;
      } else {
        currentMonthTotals.expense += transaction.amount;
        const categoryId = transaction.categoryId?.toString();
        if (categoryId) {
          expenseByCategoryCurrentMonth.set(
            categoryId,
            (expenseByCategoryCurrentMonth.get(categoryId) ?? 0) + transaction.amount,
          );
        }
      }
    }

    if (inLast30Days) {
      if (transaction.type === 'income') {
        last30Totals.income += transaction.amount;
      } else {
        last30Totals.expense += transaction.amount;
      }
    }

    if (transaction.type === 'expense' && transaction.description) {
      const label = sanitizeFreeText(transaction.description);
      if (label.length > 0) {
        const key = normalizeForMatch(label);
        const current = merchantStats.get(key);
        merchantStats.set(key, {
          label,
          total: (current?.total ?? 0) + transaction.amount,
          count: (current?.count ?? 0) + 1,
        });
      }
    }
  }

  const categories = categoryIds.size > 0
    ? await CategoryModel.find({
        _id: { $in: Array.from(categoryIds) },
        deletedAt: null,
        $or: [{ userId: input.userId }, { userId: null }],
      }).select('_id name')
    : [];

  const categoryNameById = new Map(categories.map((category) => [category.id, sanitizeFreeText(category.name)]));

  const totalCurrentMonthExpense = roundCurrency(currentMonthTotals.expense);
  const categoryBreakdown = Array.from(expenseByCategoryCurrentMonth.entries())
    .map(([categoryId, total]) => {
      const sharePercent = totalCurrentMonthExpense > 0 ? (total / totalCurrentMonthExpense) * 100 : 0;
      return {
        categoryId,
        name: categoryNameById.get(categoryId) ?? 'Uncategorized',
        total: roundCurrency(total),
        sharePercent: roundCurrency(sharePercent),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const budgetItems = budgets
    .map((budget) => {
      const categoryId = budget.categoryId.toString();
      const spentAmount = roundCurrency(expenseByCategoryCurrentMonth.get(categoryId) ?? 0);
      const limitAmount = roundCurrency(budget.limitAmount);
      const remainingAmount = roundCurrency(limitAmount - spentAmount);
      const percentUsed = limitAmount > 0 ? roundCurrency((spentAmount / limitAmount) * 100) : 0;

      let status: 'on_track' | 'near_limit' | 'over_limit' = 'on_track';
      if (percentUsed >= 100) {
        status = 'over_limit';
      } else if (percentUsed >= 80) {
        status = 'near_limit';
      }

      return {
        budgetId: budget.id,
        categoryId,
        categoryName: categoryNameById.get(categoryId) ?? 'Uncategorized',
        limitAmount,
        spentAmount,
        remainingAmount,
        percentUsed,
        status,
      };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed)
    .slice(0, 8);

  const budgetAdherence = {
    trackedCount: budgetItems.length,
    onTrackCount: budgetItems.filter((item) => item.status === 'on_track').length,
    nearLimitCount: budgetItems.filter((item) => item.status === 'near_limit').length,
    overLimitCount: budgetItems.filter((item) => item.status === 'over_limit').length,
    items: budgetItems,
  };

  const recurringRuleItems = recurringRules
    .map((rule) => {
      if (rule.kind === 'transfer') {
        const fromLabel = rule.fromAccountId ? accountNameById.get(rule.fromAccountId.toString()) : null;
        const toLabel = rule.toAccountId ? accountNameById.get(rule.toAccountId.toString()) : null;
        const label = [fromLabel, toLabel].filter(Boolean).join(' -> ') || 'Transfer';

        return {
          ruleId: rule.id,
          label,
          cadence: rule.cadence,
          amount: roundCurrency(rule.amount),
          nextRunAt: rule.nextRunAt ? rule.nextRunAt.toISOString() : null,
        };
      }

      const categoryLabel = rule.categoryId ? categoryNameById.get(rule.categoryId.toString()) : null;
      const label = sanitizeFreeText(rule.description ?? '') || categoryLabel || 'Recurring expense';

      return {
        ruleId: rule.id,
        label,
        cadence: rule.cadence,
        amount: roundCurrency(rule.amount),
        nextRunAt: rule.nextRunAt ? rule.nextRunAt.toISOString() : null,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const merchantItems = Array.from(merchantStats.values())
    .filter((entry) => entry.count >= 2)
    .map((entry) => ({
      label: entry.label,
      total: roundCurrency(entry.total),
      count: entry.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const cashflowTrend = trendMonths.map((month) => {
    const totals = trendByMonth.get(month) ?? { income: 0, expense: 0 };
    const incomeTotal = roundCurrency(totals.income);
    const expenseTotal = roundCurrency(totals.expense);

    return {
      month,
      incomeTotal,
      expenseTotal,
      netTotal: roundCurrency(incomeTotal - expenseTotal),
    };
  });

  const currentMonthIncome = roundCurrency(currentMonthTotals.income);
  const currentMonthExpense = roundCurrency(currentMonthTotals.expense);
  const currentMonthNet = roundCurrency(currentMonthIncome - currentMonthExpense);

  const last30DaysIncome = roundCurrency(last30Totals.income);
  const last30DaysExpense = roundCurrency(last30Totals.expense);
  const last30DaysNet = roundCurrency(last30DaysIncome - last30DaysExpense);

  const savingsRate = currentMonthIncome > 0
    ? roundCurrency(currentMonthNet / currentMonthIncome)
    : 0;

  const trendIncomes = cashflowTrend.map((point) => point.incomeTotal);
  const positiveIncomes = trendIncomes.filter((value) => value > 0);
  const irregularIncome = positiveIncomes.length >= 2
    ? Math.max(...positiveIncomes) / Math.max(1, Math.min(...positiveIncomes)) >= 1.5
    : positiveIncomes.length === 1 && trendIncomes.some((value) => value === 0);

  const flags = {
    overspendingCategoryNames: budgetItems
      .filter((item) => item.status === 'over_limit')
      .map((item) => item.categoryName)
      .slice(0, 8),
    negativeCashflow: currentMonthNet < 0,
    lowSavingsRate: currentMonthIncome > 0 && savingsRate < 0.1,
    irregularIncome,
  };

  const totalBalance = roundCurrency(
    balanceRows.reduce((sum, row) => sum + row.balance, 0),
  );

  const overview = {
    last30DaysIncome,
    last30DaysExpense,
    last30DaysNet,
    currentMonthIncome,
    currentMonthExpense,
    currentMonthNet,
    savingsRate,
  };

  const promptPayload: PromptPayload = {
    month: input.month,
    language: input.language,
    currency,
    preferences: {
      savingsTargetRate: preferredSavingsTargetRate,
      riskProfile: preferredRiskProfile,
    },
    balancesSnapshot: {
      accountCount: accounts.length,
      totalBalance,
    },
    spendOverview: overview,
    categoryBreakdown: categoryBreakdown.map((item) => ({
      name: item.name,
      total: item.total,
      sharePercent: item.sharePercent,
    })),
    cashflowTrend,
    budgetAdherence: {
      trackedCount: budgetAdherence.trackedCount,
      onTrackCount: budgetAdherence.onTrackCount,
      nearLimitCount: budgetAdherence.nearLimitCount,
      overLimitCount: budgetAdherence.overLimitCount,
      items: budgetItems.map((item) => ({
        categoryName: item.categoryName,
        limitAmount: item.limitAmount,
        spentAmount: item.spentAmount,
        remainingAmount: item.remainingAmount,
        percentUsed: item.percentUsed,
        status: item.status,
      })),
    },
    recurringOutflows: {
      rules: recurringRuleItems.map((item) => ({
        label: item.label,
        cadence: item.cadence,
        amount: item.amount,
      })),
      merchants: merchantItems,
    },
    flags,
  };

  let providerAdvice: ProviderOutput | null = null;
  let fallbackReason: FallbackReason | null = null;
  let providerStatus: number | null = null;
  let provider: 'cloudflare' | null = null;

  if (cloudflareConfigured && config.cloudflareAuthToken && config.cloudflareAccountId) {
    const prompt = buildPrompt(input.language, promptPayload);

    try {
      const providerResult = await generateCloudflareText(
        {
          apiToken: config.cloudflareAuthToken,
          accountId: config.cloudflareAccountId,
          model: config.cloudflareAiModel,
          timeoutMs: config.cloudflareHttpTimeoutMs,
          maxAttempts: config.cloudflareMaxAttempts,
maxTokens: 900,
systemPrompt:
  'You are Mintly AI. Return a single valid JSON object only (RFC 8259). Use double quotes for all keys/strings. No trailing commas. No markdown fences. No extra text.',
     userPrompt: prompt,
          onDiagnostic: input.onDiagnostic
            ? (event) => {
                input.onDiagnostic?.({
                  stage: event.stage,
                  provider: 'cloudflare',
                  attempt: event.attempt,
                  durationMs: event.durationMs,
                  model: event.model,
                  status: event.status,
                  ok: event.ok,
                  cfRay: event.cfRay,
                  responseShape: event.responseShape,
                  reason: event.reason,
                  errorCode: event.errorCode,
                  payloadKeys: event.payloadKeys,
                  detail: event.detail,
                  retryAfterSec: event.retryAfterSec,
                });
              }
            : undefined,
        },
        fetchImpl,
      );

      provider = providerResult.provider;
      providerStatus = providerResult.status;

      const providerText = providerResult.text;
      let parsedProviderJson: unknown | undefined;
      try {
        parsedProviderJson = parseStrictJsonPayload(providerText);
      } catch (parseError) {
  fallbackReason = 'provider_parse_error';
  input.onDiagnostic?.({
    stage: 'fallback',
    provider: 'cloudflare',
    reason: fallbackReason,
    status: providerStatus,
    detail: `provider JSON parse failed: ${
      parseError instanceof Error ? parseError.message : 'unknown'
    } | preview=${JSON.stringify(sanitizeFreeText(providerText))}`,
  });
}
      if (parsedProviderJson !== undefined) {
  const coerced = coerceProviderOutputShape(parsedProviderJson);
  const parsedProvider = providerOutputSchema.safeParse(coerced);

  if (!parsedProvider.success) {
    fallbackReason = 'provider_validation_error';
    const firstIssue = parsedProvider.error.issues[0];

    input.onDiagnostic?.({
      stage: 'fallback',
      provider: 'cloudflare',
      reason: fallbackReason,
      status: providerStatus,
      detail: `provider output schema validation failed: ${
        firstIssue ? describeZodIssue(firstIssue) : 'unknown'
      } | preview=${JSON.stringify(sanitizeFreeText(providerText))}`,
    });
  } else {
    providerAdvice = parsedProvider.data;
    fallbackReason = null;
  }
}
    } catch (error) {
      if (error instanceof CloudflareProviderError) {
        provider = 'cloudflare';
        providerStatus = error.status;

        if (error.reason === 'rate_limited') {
            throw new ApiError({
              code: 'ADVISOR_PROVIDER_RATE_LIMIT',
              message: 'Advisor provider rate limited this request',
              statusCode: 429,
              details: {
              provider: 'cloudflare',
              providerStatus: error.status ?? 429,
              retryAfterSec: error.retryAfterSec ?? 60,
              cfRay: error.cfRay,
              providerErrorCode: error.providerCode,
            },
            });
        }

        if (error.reason === 'request_invalid') {
          throw new ApiError({
            code: 'ADVISOR_PROVIDER_INVALID_REQUEST',
            message: 'Advisor provider request is invalid',
            statusCode: 500,
            details: {
              provider: 'cloudflare',
              providerStatus: error.status ?? 400,
              cfRay: error.cfRay,
              providerErrorCode: error.providerCode,
            },
          });
        }

        if (error.reason === 'timeout') {
          throw new ApiError({
            code: 'ADVISOR_PROVIDER_TIMEOUT',
            message: 'Advisor provider timed out',
            statusCode: 504,
            details: {
              provider: 'cloudflare',
              providerStatus: error.status,
              cfRay: error.cfRay,
            },
          });
        }

        if (error.reason === 'http_error') {
          fallbackReason = 'provider_http_error';
          input.onDiagnostic?.({
            stage: 'fallback',
            provider: 'cloudflare',
            reason: fallbackReason,
            status: providerStatus ?? undefined,
            cfRay: error.cfRay,
            retryAfterSec: error.retryAfterSec,
            errorCode: error.providerCode ?? undefined,
            detail: error.message,
          });
        } else {
          fallbackReason = mapCloudflareErrorToFallbackReason(error);
          input.onDiagnostic?.({
            stage: 'fallback',
            provider: 'cloudflare',
            reason: fallbackReason,
            status: providerStatus ?? undefined,
            cfRay: error.cfRay,
            errorCode: error.providerCode ?? undefined,
            detail: error.message,
          });
        }
      } else {
        if (input.regenerate) {
          throw new ApiError({
            code: 'AI_PROVIDER_UNREACHABLE',
            message: 'AI provider request failed unexpectedly',
            statusCode: 502,
            details: {
              provider: 'cloudflare',
              providerStatus,
            },
          });
        }

        fallbackReason = 'provider_unknown_error';
        input.onDiagnostic?.({
          stage: 'fallback',
          provider: 'cloudflare',
          reason: fallbackReason,
          status: providerStatus ?? undefined,
          detail: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  } else {
    fallbackReason = 'missing_api_key';
    input.onDiagnostic?.({
      stage: 'fallback',
      provider: 'cloudflare',
      reason: fallbackReason,
    });
    provider = null;
    providerStatus = null;
  }

  const fallbackAdvice = buildFallbackAdvice({
    language: input.language,
    currentMonthIncome,
    currentMonthExpense,
    currentMonthNet,
    savingsRate,
    totalBalance,
    categoryBreakdown: categoryBreakdown.map((item) => ({
      name: item.name,
      total: item.total,
    })),
    preferredSavingsTargetRate,
    preferredRiskProfile,
  });

  const mergedAdvice = providerAdvice ?? fallbackAdvice;
  const mode = providerAdvice ? 'ai' : 'fallback';

  const emergencyFundTarget = roundCurrency(Math.max(0, currentMonthExpense * 3));
  const emergencyFundCurrent = roundCurrency(Math.max(0, totalBalance));
  const emergencyFundStatus = emergencyFundTarget <= 0
    ? 'ready'
    : emergencyFundCurrent >= emergencyFundTarget
      ? 'ready'
      : emergencyFundCurrent > 0
        ? 'building'
        : 'not_started';

  const cutCandidates = mergedAdvice.expenseOptimization.cutCandidates.map((candidate) => ({
    label: candidate.label,
    currentAmount: resolveCurrentAmountFromLabel(candidate.label, categoryBreakdown, merchantItems),
    suggestedReductionPercent: clamp(roundCurrency(candidate.suggestedReductionPercent), 0, 100),
    alternativeAction: candidate.alternativeAction,
  }));

  const finalCutCandidates = cutCandidates.length > 0
    ? cutCandidates
    : categoryBreakdown.slice(0, 3).map((item) => ({
        label: item.name,
        currentAmount: item.total,
        suggestedReductionPercent: 10,
        alternativeAction: fallbackCopyByLanguage[input.language].quickWins[0],
      }));

  const result = advisorInsightSchema.parse({
    month: input.month,
    generatedAt: new Date().toISOString(),
    language: input.language,
    mode,
    modeReason: mode === 'fallback' ? fallbackReason ?? 'provider_unknown_error' : null,
    provider,
    providerStatus,
    currency,
    preferences: {
      savingsTargetRate: preferredSavingsTargetRate,
      riskProfile: preferredRiskProfile,
    },
    overview,
    categoryBreakdown,
    cashflowTrend,
    budgetAdherence,
    recurringOutflows: {
      rules: recurringRuleItems,
      merchants: merchantItems,
    },
    flags,
    advice: {
      summary: mergedAdvice.summary,
      savings: {
        targetRate: clamp(mergedAdvice.savings.targetRate, 0, 1),
        monthlyTargetAmount: roundCurrency(Math.max(0, mergedAdvice.savings.monthlyTargetAmount)),
        next7DaysActions: mergedAdvice.savings.next7DaysActions,
        autoTransferSuggestion: mergedAdvice.savings.autoTransferSuggestion,
      },
      investment: {
        emergencyFundTarget,
        emergencyFundCurrent,
        emergencyFundStatus,
        profiles: mergedAdvice.investment.profiles,
        guidance: mergedAdvice.investment.guidance,
      },
      expenseOptimization: {
        cutCandidates: finalCutCandidates,
        quickWins: mergedAdvice.expenseOptimization.quickWins,
      },
      tips: mergedAdvice.tips,
    },
  });

  advisorInsightsCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: result,
  });

  return result;
}

export function clearAdvisorInsightsCacheForTests(): void {
  advisorInsightsCache.clear();
}
