import {
  advisorInsightSchema,
  type AiInsightsLanguage,
  type AdvisorInsight,
  type RiskProfile,
} from '@mintly/shared';
import type { Types } from 'mongoose';
import { z } from 'zod';

import { generateManualAdvisorAdvice } from './advisor-manual-engine.js';
import { getMonthBoundaries } from './month.js';
import { AccountModel } from '../models/Account.js';
import { BudgetModel } from '../models/Budget.js';
import { CategoryModel } from '../models/Category.js';
import { RecurringRuleModel } from '../models/RecurringRule.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const providerOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  topFindings: z.array(z.string().min(1).max(320)).min(1).max(8),
  suggestedActions: z.array(z.string().min(1).max(320)).min(1).max(8),
  warnings: z.array(z.string().min(1).max(320)).max(8),
  savings: z.object({
    targetRate: z.number().min(0).max(1),
    monthlyTargetAmount: z.number().min(0),
    next7DaysActions: z.array(z.string().min(1).max(320)).min(1).max(8),
    autoTransferSuggestion: z.string().min(1).max(320),
  }),
  investment: z.object({
    profiles: z.array(
      z.object({
        level: z.enum(['low', 'medium', 'high']),
        title: z.string().min(1).max(180),
        rationale: z.string().min(1).max(400),
        options: z.array(z.string().min(1).max(260)).min(1).max(6),
      }),
    ).min(1).max(3),
    guidance: z.array(z.string().min(1).max(320)).min(1).max(8),
  }),
  expenseOptimization: z.object({
    cutCandidates: z
      .array(
        z.object({
          label: z.string().min(1).max(120),
          suggestedReductionPercent: z.number().min(0).max(100),
          alternativeAction: z.string().min(1).max(320),
        }),
      )
      .min(1)
      .max(6),
    quickWins: z.array(z.string().min(1).max(320)).min(1).max(8),
  }),
  tips: z.array(z.string().min(1).max(320)).min(1).max(10),
});

// Looser schema to salvage partial manual output and merge with deterministic fallback fields.
const providerOutputLooseSchema = z
  .object({
    summary: z.string().min(1).max(1500).optional(),
    topFindings: z.array(z.string().min(1).max(320)).min(1).max(12).optional(),
    suggestedActions: z.array(z.string().min(1).max(320)).min(1).max(12).optional(),
    warnings: z.array(z.string().min(1).max(320)).max(12).optional(),
    savings: z
      .object({
        targetRate: z.number().min(0).max(1).optional(),
        monthlyTargetAmount: z.number().min(0).optional(),
        next7DaysActions: z.array(z.string().min(1).max(320)).min(1).max(12).optional(),
        autoTransferSuggestion: z.string().min(1).max(320).optional(),
      })
      .optional(),
    investment: z
      .object({
        profiles: z
          .array(
            z.object({
              level: z.enum(['low', 'medium', 'high']),
              title: z.string().min(1).max(180),
              rationale: z.string().min(1).max(400),
              options: z.array(z.string().min(1).max(260)).min(1).max(8),
            }),
          )
          .min(1)
          .max(6)
          .optional(),
        guidance: z.array(z.string().min(1).max(320)).min(1).max(12).optional(),
      })
      .optional(),
    expenseOptimization: z
      .object({
        cutCandidates: z
          .array(
            z.object({
              label: z.string().min(1).max(120),
              suggestedReductionPercent: z.number().min(0).max(100),
              alternativeAction: z.string().min(1).max(320),
            }),
          )
          .min(1)
          .max(12)
          .optional(),
        quickWins: z.array(z.string().min(1).max(320)).min(1).max(12).optional(),
      })
      .optional(),
    tips: z.array(z.string().min(1).max(320)).min(1).max(16).optional(),
  })
  .passthrough();

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

  root.topFindings = coerceStringArray(root.topFindings);
  root.suggestedActions = coerceStringArray(root.suggestedActions);
  root.warnings = coerceStringArray(root.warnings);

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
  variantNonce?: string | null;
  onDiagnostic?: (event: AdvisorInsightDiagnosticEvent) => void;
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

type ProviderDiagnosticStage =
  | 'provider_config'
  | 'provider_attempt'
  | 'provider_request'
  | 'provider_response'
  | 'provider_response_body'
  | 'manual_engine'
  | 'provider_request_invalid'
  | 'provider_error'
  | 'provider_health'
  | 'fallback';

interface AdvisorInsightDiagnosticEvent {
  stage: ProviderDiagnosticStage;
  attempt?: number;
  durationMs?: number;
  provider?: 'cloudflare' | 'onysoft' | 'manual';
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
  triggeredCategories?: string[];
  variantSeedSource?: 'stable' | 'nonce';
  variantNoncePresent?: boolean;
  variantKey?: string;
  selectedTemplateIndexes?: {
    summary: number;
    findings: number[];
    actions: number[];
  };
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

function formatSignedPercent(value: number): string {
  const rounded = roundCurrency(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

function calculateMoMPercent(current: number, previous: number): number | null {
  if (previous <= 0) {
    return current > 0 ? 100 : null;
  }

  return roundCurrency(((current - previous) / previous) * 100);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const left = sorted[mid - 1] ?? 0;
    const right = sorted[mid] ?? left;
    return (left + right) / 2;
  }

  return sorted[mid] ?? 0;
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

function normalizeInsightLine(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqByNormalized(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of items) {
    const trimmed = String(raw ?? '').trim();
    if (trimmed.length === 0) continue;

    const key = normalizeInsightLine(trimmed);
    if (key.length === 0) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(trimmed);
  }

  return out;
}

function isLowValueInsight(line: string): boolean {
  const n = normalizeInsightLine(line);

  // Very generic / repetitive filler patterns (TR + EN). Keep this list small and safe.
  const bannedSubstrings = [
    'dikkatlice izleyin',
    'dikkatle izleyin',
    'izlemeniz gereken',
    'izleyin',
    'artirmak icin',
    'increase your',
    'monitor',
    'keep an eye',
    'takip edin',
  ];

  if (bannedSubstrings.some((s) => n.includes(s))) {
    return true;
  }

  // If it is extremely short, it is usually useless.
  if (n.length < 18) return true;

  return false;
}

function cleanProviderList(items: string[] | undefined, max: number): string[] | undefined {
  if (!items) return undefined;
  const deduped = uniqByNormalized(items);
  const filtered = deduped.filter((line) => !isLowValueInsight(line));
  const chosen = (filtered.length > 0 ? filtered : deduped).slice(0, max);
  return chosen.length > 0 ? chosen : undefined;
}

function mergeProviderWithFallback(providerPartial: Partial<ProviderOutput>, fallback: ProviderOutput): ProviderOutput {
  const topFindings = cleanProviderList(providerPartial.topFindings, 5) ?? fallback.topFindings;
  const suggestedActions = cleanProviderList(providerPartial.suggestedActions, 5) ?? fallback.suggestedActions;
  const warnings = cleanProviderList(providerPartial.warnings ?? [], 6) ?? fallback.warnings;
  const tips = cleanProviderList(providerPartial.tips, 6) ?? fallback.tips;

  const merged: ProviderOutput = {
    summary: providerPartial.summary?.trim() ? providerPartial.summary : fallback.summary,
    topFindings,
    suggestedActions,
    warnings,
    savings: {
      targetRate: providerPartial.savings?.targetRate ?? fallback.savings.targetRate,
      monthlyTargetAmount: providerPartial.savings?.monthlyTargetAmount ?? fallback.savings.monthlyTargetAmount,
      next7DaysActions:
        cleanProviderList(providerPartial.savings?.next7DaysActions, 5) ?? fallback.savings.next7DaysActions,
      autoTransferSuggestion:
        providerPartial.savings?.autoTransferSuggestion ?? fallback.savings.autoTransferSuggestion,
    },
    investment: {
      profiles: providerPartial.investment?.profiles ?? fallback.investment.profiles,
      guidance: cleanProviderList(providerPartial.investment?.guidance, 6) ?? fallback.investment.guidance,
    },
    expenseOptimization: {
      cutCandidates: providerPartial.expenseOptimization?.cutCandidates ?? fallback.expenseOptimization.cutCandidates,
      quickWins: cleanProviderList(providerPartial.expenseOptimization?.quickWins, 6) ?? fallback.expenseOptimization.quickWins,
    },
    tips,
  };

  // Ensure arrays meet minimums (fallback already satisfies them)
  return providerOutputSchema.parse(merged);
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

function buildFallbackAdvice(params: {
  language: AiInsightsLanguage;
  currentMonthIncome: number;
  currentMonthExpense: number;
  currentMonthNet: number;
  savingsRate: number;
  totalBalance: number;
  categoryBreakdown: Array<{ name: string; total: number }>;
  incomeMoMPercent: number | null;
  expenseMoMPercent: number | null;
  topExpenseDrivers: Array<{ name: string; changeAmount: number; changePercent: number }>;
  recurringBurdenRatio: number;
  anomalyTransactions: Array<{ label: string; amount: number; occurredAt: string }>;
  overspendingCategoryNames: string[];
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

  const recurringBurdenPercent = roundCurrency(params.recurringBurdenRatio * 100);
  const incomeMoMText = params.incomeMoMPercent === null
    ? null
    : formatSignedPercent(params.incomeMoMPercent);
  const expenseMoMText = params.expenseMoMPercent === null
    ? null
    : formatSignedPercent(params.expenseMoMPercent);
  const primaryDriver = params.topExpenseDrivers[0] ?? null;
  const anomalyCount = params.anomalyTransactions.length;
  const overspendingNames = params.overspendingCategoryNames.slice(0, 3).join(', ');

  const topFindings: string[] = [];
  const suggestedActions: string[] = [];
  const warnings: string[] = [];

  if (params.language === 'tr') {
    topFindings.push(
      incomeMoMText && expenseMoMText
        ? `Gelir geçen aya göre ${incomeMoMText}, gider ise ${expenseMoMText} değişti.`
        : 'Aylık trend verisi sınırlı; gelir ve gider değişimini haftalık takip et.',
    );
    topFindings.push(
      primaryDriver
        ? `${primaryDriver.name} gider değişimini en çok etkileyen kalem (${formatSignedPercent(primaryDriver.changePercent)}).`
        : 'Bu ay gider artışını tek başına sürükleyen belirgin bir kalem görünmüyor.',
    );
    topFindings.push(`Düzenli gider yükü toplam giderin yaklaşık %${recurringBurdenPercent} seviyesinde.`);
    topFindings.push(
      params.overspendingCategoryNames.length > 0
        ? `Bütçe baskısı olan kategoriler: ${overspendingNames}.`
        : 'Bütçe uyumu genel olarak kontrol altında.',
    );
    if (anomalyCount > 0) {
      topFindings.push(`${anomalyCount} sıra dışı işlem tespit edildi.`);
    }

    suggestedActions.push(copy.savingsActions[0], copy.savingsActions[1], copy.savingsActions[2]);
    if (params.overspendingCategoryNames.length > 0) {
      suggestedActions.push(`${params.overspendingCategoryNames[0]} için 7 günlük harcama tavanı uygula.`);
    }
    if (recurringBurdenPercent >= 35) {
      suggestedActions.push('Bu hafta düşük kullanımda kalan bir aboneliği duraklat veya düşür.');
    }
    if (anomalyCount > 0) {
      suggestedActions.push('Sıra dışı işlemleri doğrula ve tek seferlik giderleri etiketle.');
    }

    if (params.currentMonthNet < 0) {
      warnings.push('Bu ay nakit akışı negatif seyrediyor.');
    }
    if (params.savingsRate < targetRate) {
      warnings.push('Birikim oranı hedefin altında.');
    }
    if (params.overspendingCategoryNames.length > 0) {
      warnings.push(`Bütçe aşımı riski: ${overspendingNames}.`);
    }
    if (recurringBurdenPercent >= 45) {
      warnings.push('Düzenli gider oranı yüksek, esnek harcama alanını daraltıyor.');
    }
    if (anomalyCount > 0) {
      warnings.push('Sıra dışı tutarlı işlemler manuel kontrol gerektiriyor.');
    }
  } else if (params.language === 'ru') {
    topFindings.push(
      incomeMoMText && expenseMoMText
        ? `Доход изменился на ${incomeMoMText}, расход на ${expenseMoMText} относительно прошлого месяца.`
        : 'Данных по тренду мало: отслеживайте динамику доходов и расходов еженедельно.',
    );
    topFindings.push(
      primaryDriver
        ? `${primaryDriver.name} главный драйвер изменения расходов (${formatSignedPercent(primaryDriver.changePercent)}).`
        : 'Явного одного драйвера изменения расходов в этом месяце не обнаружено.',
    );
    topFindings.push(`Доля регулярных списаний около ${recurringBurdenPercent}% от текущих расходов.`);
    topFindings.push(
      params.overspendingCategoryNames.length > 0
        ? `Категории с бюджетным давлением: ${overspendingNames}.`
        : 'Исполнение бюджета в целом под контролем.',
    );
    if (anomalyCount > 0) {
      topFindings.push(`Обнаружено необычных операций: ${anomalyCount}.`);
    }

    suggestedActions.push(copy.savingsActions[0], copy.savingsActions[1], copy.savingsActions[2]);
    if (params.overspendingCategoryNames.length > 0) {
      suggestedActions.push(`Установите недельный лимит для категории ${params.overspendingCategoryNames[0]}.`);
    }
    if (recurringBurdenPercent >= 35) {
      suggestedActions.push('Отключите или понизьте хотя бы один малоиспользуемый регулярный платеж.');
    }
    if (anomalyCount > 0) {
      suggestedActions.push('Проверьте необычные операции и отметьте разовые расходы.');
    }

    if (params.currentMonthNet < 0) {
      warnings.push('Денежный поток за текущий месяц отрицательный.');
    }
    if (params.savingsRate < targetRate) {
      warnings.push('Норма сбережений ниже целевого уровня.');
    }
    if (params.overspendingCategoryNames.length > 0) {
      warnings.push(`Риск перерасхода бюджета: ${overspendingNames}.`);
    }
    if (recurringBurdenPercent >= 45) {
      warnings.push('Высокая доля регулярных списаний снижает гибкость бюджета.');
    }
    if (anomalyCount > 0) {
      warnings.push('Необычные операции требуют ручной проверки.');
    }
  } else {
    topFindings.push(
      incomeMoMText && expenseMoMText
        ? `Income changed ${incomeMoMText} and expenses changed ${expenseMoMText} versus last month.`
        : 'Monthly trend data is limited; monitor income and expense movement weekly.',
    );
    topFindings.push(
      primaryDriver
        ? `${primaryDriver.name} is the main expense driver (${formatSignedPercent(primaryDriver.changePercent)} month-over-month).`
        : 'No single category is dominating expense change this month.',
    );
    topFindings.push(`Recurring burden ratio is about ${recurringBurdenPercent}% of current month expenses.`);
    topFindings.push(
      params.overspendingCategoryNames.length > 0
        ? `Budget pressure is concentrated in: ${overspendingNames}.`
        : 'Budget adherence is mostly on track.',
    );
    if (anomalyCount > 0) {
      topFindings.push(`${anomalyCount} unusual transactions were detected.`);
    }

    suggestedActions.push(copy.savingsActions[0], copy.savingsActions[1], copy.savingsActions[2]);
    if (params.overspendingCategoryNames.length > 0) {
      suggestedActions.push(`Set a 7-day spending cap for ${params.overspendingCategoryNames[0]}.`);
    }
    if (recurringBurdenPercent >= 35) {
      suggestedActions.push('Pause or downgrade one low-value recurring payment this week.');
    }
    if (anomalyCount > 0) {
      suggestedActions.push('Review unusual transactions and tag one-off expenses.');
    }

    if (params.currentMonthNet < 0) {
      warnings.push('Current month cashflow is negative.');
    }
    if (params.savingsRate < targetRate) {
      warnings.push('Savings rate is below your target.');
    }
    if (params.overspendingCategoryNames.length > 0) {
      warnings.push(`Budget overrun risk in ${overspendingNames}.`);
    }
    if (recurringBurdenPercent >= 45) {
      warnings.push('Recurring burden is high versus total monthly expenses.');
    }
    if (anomalyCount > 0) {
      warnings.push('Unusual high-value transactions require verification.');
    }
  }

  const dedupe = (items: string[]): string[] =>
    Array.from(new Set(items.map((item) => item.trim()).filter((item) => item.length > 0)));
  const summary = params.currentMonthNet >= 0
    ? copy.summary
    : params.language === 'tr'
      ? 'Aylık nakit akışı negatif. Önceliği giderleri dengelemeye ve kritik olmayan harcamaları azaltmaya ver.'
      : params.language === 'ru'
        ? 'Денежный поток за месяц отрицательный. Сначала стабилизируйте расходы и сократите необязательные траты.'
        : 'Monthly cashflow is negative. Prioritize expense stabilization before taking additional risk.';

  const finalTopFindings = dedupe(topFindings).slice(0, 8);
  const finalSuggestedActions = dedupe(suggestedActions).slice(0, 8);
  const finalWarnings = dedupe(warnings).slice(0, 8);

  return {
    summary,
    topFindings: finalTopFindings.length > 0 ? finalTopFindings : [copy.summary],
    suggestedActions: finalSuggestedActions.length > 0 ? finalSuggestedActions : copy.savingsActions,
    warnings: finalWarnings,
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
  _fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<AdvisorInsight> {
  input.onDiagnostic?.({
    stage: 'provider_config',
    provider: 'manual',
    keyConfigured: true,
    endpointBase: 'manual://advisor-manual-engine',
    model: 'manual-insights-v1',
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
  const expenseByCategoryPreviousMonth = new Map<string, number>();
  const currentMonthTotals = { income: 0, expense: 0 };
  const last30Totals = { income: 0, expense: 0 };
  const trendByMonth = new Map<string, { income: number; expense: number }>(
    trendMonths.map((month) => [month, { income: 0, expense: 0 }]),
  );
  const previousMonth = trendMonths[1] ?? shiftMonth(input.month, -1);
  const recentExpenseAmounts: number[] = [];
  const currentMonthExpenseCandidates: Array<{
    amount: number;
    categoryId: string | null;
    description: string | null;
    occurredAt: Date;
  }> = [];

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

    const categoryId = transaction.categoryId?.toString() ?? null;
    if (categoryId) {
      categoryIds.add(categoryId);
    }

    if (transaction.type === 'expense') {
      recentExpenseAmounts.push(transaction.amount);
      if (txMonth === previousMonth && categoryId) {
        expenseByCategoryPreviousMonth.set(
          categoryId,
          (expenseByCategoryPreviousMonth.get(categoryId) ?? 0) + transaction.amount,
        );
      }
    }

    const txTime = transaction.occurredAt.getTime();
    const inCurrentMonth = txTime >= monthBounds.start.getTime() && txTime < monthBounds.endExclusive.getTime();
    const inLast30Days = txTime >= last30From.getTime() && txTime < last30ToExclusive.getTime();

    if (inCurrentMonth) {
      if (transaction.type === 'income') {
        currentMonthTotals.income += transaction.amount;
      } else {
        currentMonthTotals.expense += transaction.amount;
        if (categoryId) {
          expenseByCategoryCurrentMonth.set(
            categoryId,
            (expenseByCategoryCurrentMonth.get(categoryId) ?? 0) + transaction.amount,
          );
        }
        currentMonthExpenseCandidates.push({
          amount: transaction.amount,
          categoryId,
          description: transaction.description ?? null,
          occurredAt: transaction.occurredAt,
        });
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

  const topExpenseDrivers = Array.from(
    new Set([
      ...expenseByCategoryCurrentMonth.keys(),
      ...expenseByCategoryPreviousMonth.keys(),
    ]),
  )
    .map((categoryId) => {
      const current = expenseByCategoryCurrentMonth.get(categoryId) ?? 0;
      const previous = expenseByCategoryPreviousMonth.get(categoryId) ?? 0;
      const changeAmount = current - previous;
      const changePercent = previous > 0
        ? (changeAmount / previous) * 100
        : current > 0
          ? 100
          : 0;

      return {
        name: categoryNameById.get(categoryId) ?? 'Uncategorized',
        changeAmount: roundCurrency(changeAmount),
        changePercent: roundCurrency(changePercent),
      };
    })
    .filter((item) => Math.abs(item.changeAmount) > 0.01)
    .sort((a, b) => Math.abs(b.changeAmount) - Math.abs(a.changeAmount))
    .slice(0, 3);

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

  const previousTrendPoint = cashflowTrend[cashflowTrend.length - 2] ?? null;
  const currentTrendPoint = cashflowTrend[cashflowTrend.length - 1] ?? null;
  const incomeMoMPercent = previousTrendPoint && currentTrendPoint
    ? calculateMoMPercent(currentTrendPoint.incomeTotal, previousTrendPoint.incomeTotal)
    : null;
  const expenseMoMPercent = previousTrendPoint && currentTrendPoint
    ? calculateMoMPercent(currentTrendPoint.expenseTotal, previousTrendPoint.expenseTotal)
    : null;

  const recurringMonthlyOutflow = roundCurrency(
    recurringRules.reduce((sum, rule) => {
      const cadenceFactor = rule.cadence === 'weekly' ? 4.345 : 1;
      return sum + rule.amount * cadenceFactor;
    }, 0),
  );
  const recurringBurdenRatio = currentMonthExpense > 0
    ? clamp(roundCurrency(recurringMonthlyOutflow / currentMonthExpense), 0, 5)
    : 0;

  const anomalyThreshold = Math.max(200, roundCurrency(median(recentExpenseAmounts) * 2.2));
  const anomalyTransactions = currentMonthExpenseCandidates
    .filter((candidate) => candidate.amount >= anomalyThreshold)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((candidate) => {
      const descriptionLabel = sanitizeFreeText(candidate.description ?? '');
      const categoryLabel = candidate.categoryId ? categoryNameById.get(candidate.categoryId) : null;

      return {
        label: descriptionLabel || categoryLabel || 'Expense',
        amount: roundCurrency(candidate.amount),
        occurredAt: toDateOnlyUtc(candidate.occurredAt),
      };
    });

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
    incomeMoMPercent,
    expenseMoMPercent,
    topExpenseDrivers,
    recurringBurdenRatio,
    anomalyTransactions,
    overspendingCategoryNames: flags.overspendingCategoryNames,
    preferredSavingsTargetRate,
    preferredRiskProfile,
  });

  const manualEngineResult = generateManualAdvisorAdvice({
    userId: input.userId.toString(),
    month: input.month,
    language: input.language,
    currency: currency ?? 'TRY',
    regenerate: Boolean(input.regenerate),
    variantNonce: input.variantNonce,
    currentMonthIncome,
    currentMonthExpense,
    currentMonthNet,
    savingsRate,
    savingsTargetRate: preferredSavingsTargetRate,
    incomeMoMPercent,
    expenseMoMPercent,
    recurringBurdenRatio,
    topExpenseDriverName: topExpenseDrivers[0]?.name ?? null,
    categoryTopName: categoryBreakdown[0]?.name ?? null,
    budgetNearLimitCount: budgetAdherence.nearLimitCount,
    budgetOverLimitCount: budgetAdherence.overLimitCount,
    anomalyCount: anomalyTransactions.length,
  });

  input.onDiagnostic?.({
    stage: 'manual_engine',
    provider: 'manual',
    reason: 'manual_engine',
    detail: `findings=${manualEngineResult.findings.length}`,
    triggeredCategories: [...manualEngineResult.triggeredCategories],
    variantSeedSource: manualEngineResult.variantSeedSource,
    variantNoncePresent: manualEngineResult.variantNoncePresent,
    variantKey: manualEngineResult.variantKey,
    selectedTemplateIndexes: manualEngineResult.selectedTemplateIndexes,
  });

  const mergedAdvice = mergeProviderWithFallback({
    summary: manualEngineResult.advice.summary,
    topFindings: manualEngineResult.advice.topFindings,
    suggestedActions: manualEngineResult.advice.suggestedActions,
    warnings: manualEngineResult.advice.warnings,
    savings: {
      targetRate: fallbackAdvice.savings.targetRate,
      monthlyTargetAmount: fallbackAdvice.savings.monthlyTargetAmount,
      next7DaysActions: manualEngineResult.advice.next7DaysActions,
      autoTransferSuggestion: manualEngineResult.advice.autoTransferSuggestion,
    },
    investment: {
      profiles: fallbackAdvice.investment.profiles,
      guidance: manualEngineResult.advice.investmentGuidance,
    },
    expenseOptimization: {
      cutCandidates: fallbackAdvice.expenseOptimization.cutCandidates,
      quickWins: manualEngineResult.advice.quickWins,
    },
    tips: manualEngineResult.advice.tips,
  }, fallbackAdvice);

  const mode = 'manual' as const;
  const modeReason = 'manual_engine';
  const provider = 'manual' as const;
  const providerStatus: number | null = null;

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
    modeReason,
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
      topFindings: mergedAdvice.topFindings,
      suggestedActions: mergedAdvice.suggestedActions,
      warnings: mergedAdvice.warnings,
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
