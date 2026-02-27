import type { AiInsightsLanguage } from '@mintly/shared';

import {
  getTemplateBank,
  normalizeTemplateLanguage,
  type CategoryKey,
} from './advisor-templates/index.js';

export type ManualVariantSeedSource = 'stable' | 'nonce';

export interface ManualFindingDiagnostic {
  category: CategoryKey;
  severity: 'low' | 'medium' | 'high';
  facts: Record<string, number | string>;
}

export interface ManualEngineInput {
  userId: string;
  month: string;
  language: AiInsightsLanguage;
  currency: string;
  regenerate: boolean;
  variantNonce?: string | null;
  currentMonthIncome: number;
  currentMonthExpense: number;
  currentMonthNet: number;
  savingsRate: number;
  savingsTargetRate: number;
  incomeMoMPercent: number | null;
  expenseMoMPercent: number | null;
  recurringBurdenRatio: number;
  topExpenseDriverName: string | null;
  categoryTopName: string | null;
  budgetNearLimitCount: number;
  budgetOverLimitCount: number;
  anomalyCount: number;
}

interface SelectedTemplateIndexes {
  summary: number;
  findings: number[];
  actions: number[];
}

export interface ManualEngineOutput {
  triggeredCategories: CategoryKey[];
  variantSeedSource: ManualVariantSeedSource;
  variantKey: string;
  variantNoncePresent: boolean;
  selectedTemplateIndexes: SelectedTemplateIndexes;
  findings: ManualFindingDiagnostic[];
  advice: {
    summary: string;
    topFindings: string[];
    suggestedActions: string[];
    warnings: string[];
    tips: string[];
    next7DaysActions: string[];
    autoTransferSuggestion: string;
    investmentGuidance: string[];
    quickWins: string[];
  };
}

function toLocale(language: 'tr' | 'en' | 'ru'): string {
  if (language === 'tr') return 'tr-TR';
  if (language === 'ru') return 'ru-RU';
  return 'en-US';
}

function formatMonthLabel(month: string, language: 'tr' | 'en' | 'ru'): string {
  const [yearRaw, monthRaw] = month.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const date = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));

  return new Intl.DateTimeFormat(toLocale(language), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatCurrency(value: number, currency: string, language: 'tr' | 'en' | 'ru'): string {
  return new Intl.NumberFormat(toLocale(language), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number, language: 'tr' | 'en' | 'ru', maxFractionDigits = 1): string {
  return new Intl.NumberFormat(toLocale(language), {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

function formatSignedPercent(value: number | null, language: 'tr' | 'en' | 'ru', maxFractionDigits = 1): string {
  const numeric = value ?? 0;
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${formatPercent(numeric, language, maxFractionDigits)}`;
}

function shiftMonth(month: string, delta: number): string {
  const [yearRaw, monthRaw] = month.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const date = new Date(Date.UTC(year, monthIndex + delta, 1, 0, 0, 0, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nextInt(rand: () => number, maxExclusive: number): number {
  if (maxExclusive <= 1) {
    return 0;
  }
  return Math.floor(rand() * maxExclusive);
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function renderTemplate(
  template: string,
  tokens: Record<string, string>,
  fallback: string,
): string {
  let missingCount = 0;

  const rendered = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const token = tokens[key];
    if (token === undefined || token === null || token.trim().length === 0) {
      missingCount += 1;
      return '';
    }
    return token;
  });

  const normalized = rendered
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();

  if (normalized.length < 24) {
    return fallback;
  }
  if (missingCount > 0 && normalized.length < 40) {
    return fallback;
  }

  return normalized;
}

function dedupeKeepOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const key = normalizeLine(item);
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item.trim());
  }

  return out;
}

function fallbackCategoryLabel(language: 'tr' | 'en' | 'ru'): string {
  if (language === 'tr') return 'genel harcama';
  if (language === 'ru') return 'общие расходы';
  return 'general spending';
}

function fallbackSummary(language: 'tr' | 'en' | 'ru'): string {
  if (language === 'tr') {
    return 'Aylık finansal görünüm hazır. Küçük ve düzenli kontrol adımları, toplam dengeyi daha güçlü hale getirir.';
  }
  if (language === 'ru') {
    return 'Месячный финансовый обзор готов. Небольшие регулярные действия обычно дают самый устойчивый результат.';
  }
  return 'Monthly financial overview is ready. Small consistent controls usually produce the most stable outcome.';
}

function fallbackFinding(language: 'tr' | 'en' | 'ru'): string {
  if (language === 'tr') {
    return 'Veri, erken müdahalenin geç düzeltmeden daha düşük maliyetli olduğunu gösteriyor.';
  }
  if (language === 'ru') {
    return 'Данные показывают, что ранняя корректировка почти всегда дешевле поздней компенсации.';
  }
  return 'Data suggests early corrections are usually cheaper than late-stage fixes.';
}

function fallbackAction(language: 'tr' | 'en' | 'ru'): string {
  if (language === 'tr') {
    return 'Bu hafta için üç metrik seç ve her gün 2 dakikalık kontrol ritmi uygula.';
  }
  if (language === 'ru') {
    return 'На эту неделю выбери три метрики и делай ежедневную проверку в течение двух минут.';
  }
  return 'Pick three metrics for this week and run a two-minute daily check-in.';
}

function pickUniqueTemplates(params: {
  pool: string[];
  count: number;
  rand: () => number;
  tokens: Record<string, string>;
  fallbackLine: string;
}): { lines: string[]; indexes: number[] } {
  const lines: string[] = [];
  const indexes: number[] = [];
  const usedLines = new Set<string>();
  const usedIndexes = new Set<number>();

  const maxAttempts = Math.max(params.count * 14, params.pool.length * 4);
  let attempts = 0;

  while (
    lines.length < params.count
    && attempts < maxAttempts
    && params.pool.length > 0
  ) {
    attempts += 1;
    const index = nextInt(params.rand, params.pool.length);
    if (usedIndexes.has(index)) {
      continue;
    }

    const rendered = renderTemplate(
      params.pool[index] ?? '',
      params.tokens,
      params.fallbackLine,
    );
    const lineKey = normalizeLine(rendered);
    if (lineKey.length === 0 || usedLines.has(lineKey)) {
      continue;
    }

    usedIndexes.add(index);
    usedLines.add(lineKey);
    indexes.push(index);
    lines.push(rendered);
  }

  if (lines.length < params.count) {
    for (let index = 0; index < params.pool.length && lines.length < params.count; index += 1) {
      if (usedIndexes.has(index)) {
        continue;
      }
      const rendered = renderTemplate(
        params.pool[index] ?? '',
        params.tokens,
        params.fallbackLine,
      );
      const lineKey = normalizeLine(rendered);
      if (lineKey.length === 0 || usedLines.has(lineKey)) {
        continue;
      }
      usedIndexes.add(index);
      usedLines.add(lineKey);
      indexes.push(index);
      lines.push(rendered);
    }
  }

  while (lines.length < params.count) {
    const fallback = renderTemplate(params.fallbackLine, params.tokens, params.fallbackLine);
    const key = normalizeLine(fallback);
    if (!usedLines.has(key)) {
      usedLines.add(key);
      lines.push(fallback);
      indexes.push(-1);
      continue;
    }
    break;
  }

  return { lines, indexes };
}

function buildPool(
  byCategory: Record<CategoryKey, string[]>,
  categories: CategoryKey[],
  generic: string[],
): string[] {
  const out: string[] = [];
  for (const category of categories) {
    const values = byCategory[category] ?? [];
    out.push(...values);
  }
  out.push(...generic);
  return out;
}

function deriveTriggeredCategories(input: ManualEngineInput): CategoryKey[] {
  const categories: CategoryKey[] = [];

  categories.push('cashflow');

  if (input.currentMonthNet < 0) {
    categories.push('risk', 'debt');
  }

  if (input.expenseMoMPercent !== null && Math.abs(input.expenseMoMPercent) >= 6) {
    categories.push('spending');
  }

  if (input.incomeMoMPercent !== null && Math.abs(input.incomeMoMPercent) >= 6) {
    categories.push('income');
  }

  if (input.recurringBurdenRatio >= 0.22) {
    categories.push('subscriptions');
  }

  if ((input.savingsRate * 100) < input.savingsTargetRate || input.savingsRate < 0.15) {
    categories.push('savings');
  }

  if (input.budgetNearLimitCount > 0 || input.budgetOverLimitCount > 0) {
    categories.push('budgeting');
  }

  if (input.anomalyCount > 0) {
    categories.push('risk');
  }

  categories.push('goals');

  if (input.currentMonthNet > 0 && input.savingsRate >= 0.04) {
    categories.push('investing');
  }

  const unique = Array.from(new Set(categories));
  const fillOrder: CategoryKey[] = [
    'spending',
    'savings',
    'budgeting',
    'subscriptions',
    'income',
    'risk',
    'goals',
    'investing',
    'debt',
    'cashflow',
  ];

  for (const category of fillOrder) {
    if (unique.length >= 5) {
      break;
    }
    if (!unique.includes(category)) {
      unique.push(category);
    }
  }

  return unique;
}

function resolveSeverity(category: CategoryKey, input: ManualEngineInput): 'low' | 'medium' | 'high' {
  if (category === 'cashflow' || category === 'debt' || category === 'risk') {
    if (input.currentMonthNet < 0 && Math.abs(input.currentMonthNet) > Math.max(2000, input.currentMonthIncome * 0.1)) {
      return 'high';
    }
    if (input.currentMonthNet < 0 || input.anomalyCount >= 2) {
      return 'medium';
    }
    return 'low';
  }

  if (category === 'spending') {
    const pct = Math.abs(input.expenseMoMPercent ?? 0);
    if (pct >= 20) return 'high';
    if (pct >= 10) return 'medium';
    return 'low';
  }

  if (category === 'budgeting') {
    if (input.budgetOverLimitCount >= 2) return 'high';
    if (input.budgetOverLimitCount >= 1 || input.budgetNearLimitCount >= 2) return 'medium';
    return 'low';
  }

  if (category === 'subscriptions') {
    if (input.recurringBurdenRatio >= 0.45) return 'high';
    if (input.recurringBurdenRatio >= 0.3) return 'medium';
    return 'low';
  }

  if (category === 'savings') {
    const savingsPct = input.savingsRate * 100;
    if (savingsPct < input.savingsTargetRate * 0.5) return 'high';
    if (savingsPct < input.savingsTargetRate) return 'medium';
    return 'low';
  }

  return 'low';
}

function resolveFacts(category: CategoryKey, input: ManualEngineInput): Record<string, number | string> {
  switch (category) {
    case 'cashflow':
      return {
        currentMonthNet: Number(input.currentMonthNet.toFixed(2)),
        currentMonthIncome: Number(input.currentMonthIncome.toFixed(2)),
        currentMonthExpense: Number(input.currentMonthExpense.toFixed(2)),
      };
    case 'spending':
      return {
        expenseMoMPercent: Number((input.expenseMoMPercent ?? 0).toFixed(2)),
        topCategory: input.categoryTopName ?? input.topExpenseDriverName ?? 'n/a',
      };
    case 'income':
      return {
        incomeMoMPercent: Number((input.incomeMoMPercent ?? 0).toFixed(2)),
      };
    case 'savings':
      return {
        savingsRatePct: Number((input.savingsRate * 100).toFixed(2)),
        targetRatePct: Number(input.savingsTargetRate.toFixed(2)),
      };
    case 'risk':
      return {
        anomalyCount: input.anomalyCount,
        budgetOverLimitCount: input.budgetOverLimitCount,
      };
    case 'subscriptions':
      return {
        recurringBurdenPct: Number((input.recurringBurdenRatio * 100).toFixed(2)),
      };
    case 'goals':
      return {
        month: input.month,
      };
    case 'debt':
      return {
        currentMonthNet: Number(input.currentMonthNet.toFixed(2)),
      };
    case 'investing':
      return {
        savingsRatePct: Number((input.savingsRate * 100).toFixed(2)),
      };
    case 'budgeting':
      return {
        overLimitCount: input.budgetOverLimitCount,
        nearLimitCount: input.budgetNearLimitCount,
      };
    default:
      return {};
  }
}

function buildWarnings(
  language: 'tr' | 'en' | 'ru',
  input: ManualEngineInput,
  tokens: Record<string, string>,
): string[] {
  const warnings: string[] = [];

  if (input.currentMonthNet < 0) {
    if (language === 'tr') {
      warnings.push(`Nakit akışı şu anda negatif bölgede ({netAmount}); kısa vadede harcama temposu düşürülmeli.`.replace('{netAmount}', tokens.netAmount));
    } else if (language === 'ru') {
      warnings.push(`Денежный поток находится в отрицательной зоне ({netAmount}); в ближайшие недели лучше снизить темп трат.`.replace('{netAmount}', tokens.netAmount));
    } else {
      warnings.push(`Cashflow is currently negative (${tokens.netAmount}); reducing spend velocity should be prioritized short-term.`);
    }
  }

  if (input.recurringBurdenRatio >= 0.35) {
    if (language === 'tr') {
      warnings.push('Düzenli gider oranı yükseldi; esnek bütçe alanı daralıyor.');
    } else if (language === 'ru') {
      warnings.push('Доля регулярных расходов повышена; гибкость бюджета снижается.');
    } else {
      warnings.push('Recurring-cost ratio is elevated and reducing budget flexibility.');
    }
  }

  if (input.budgetOverLimitCount > 0) {
    if (language === 'tr') {
      warnings.push(`${tokens.overBudgetCount} kategori limit aştı; ay sonu baskısı artabilir.`);
    } else if (language === 'ru') {
      warnings.push(`${tokens.overBudgetCount} категорий уже выше лимита; давление к концу месяца может усилиться.`);
    } else {
      warnings.push(`${tokens.overBudgetCount} categories are already over limit; month-end pressure may increase.`);
    }
  }

  if (input.anomalyCount > 0) {
    if (language === 'tr') {
      warnings.push(`${tokens.anomalyCount} sıra dışı işlem var; doğrulama yapılmadan otomatik karar alınmamalı.`);
    } else if (language === 'ru') {
      warnings.push(`Обнаружено ${tokens.anomalyCount} нестандартных операций; лучше проверить их до автоматических решений.`);
    } else {
      warnings.push(`${tokens.anomalyCount} unusual transactions were flagged; verify before applying automated assumptions.`);
    }
  }

  return dedupeKeepOrder(warnings).slice(0, 4);
}

function pickStatic(list: string[], count: number, rand: () => number): string[] {
  const pool = list.slice();
  const out: string[] = [];
  while (out.length < count && pool.length > 0) {
    const index = nextInt(rand, pool.length);
    const [picked] = pool.splice(index, 1);
    if (picked) {
      out.push(picked);
    }
  }
  return out;
}

export function generateManualAdvisorAdvice(input: ManualEngineInput): ManualEngineOutput {
  const language = normalizeTemplateLanguage(input.language);
  const bank = getTemplateBank(language);
  const triggeredCategories = deriveTriggeredCategories(input);

  const baseSeed = hashString(`${input.userId}|${input.month}|${language}`);
  const nonceRaw = input.variantNonce?.trim() ?? '';
  const noncePresent = nonceRaw.length > 0;

  const seed = input.regenerate
    ? hashString(`${baseSeed}|${noncePresent ? nonceRaw : 'regenerate'}`)
    : baseSeed;
  const seedSource: ManualVariantSeedSource = input.regenerate ? 'nonce' : 'stable';
  const variantKey = seed.toString(16).padStart(8, '0').slice(0, 8);
  const rand = createPrng(seed);

  const comparedMonth = shiftMonth(input.month, -1);
  const topCategory = input.categoryTopName ?? input.topExpenseDriverName ?? fallbackCategoryLabel(language);

  const tokens: Record<string, string> = {
    monthName: formatMonthLabel(input.month, language),
    comparedMonthName: formatMonthLabel(comparedMonth, language),
    currency: input.currency,
    netAmount: formatCurrency(input.currentMonthNet, input.currency, language),
    spendDeltaPct: formatSignedPercent(input.expenseMoMPercent, language),
    incomeDeltaPct: formatSignedPercent(input.incomeMoMPercent, language),
    savingsRatePct: formatPercent(input.savingsRate * 100, language),
    targetSavingsRatePct: formatPercent(input.savingsTargetRate, language),
    topCategory,
    overBudgetCount: String(input.budgetOverLimitCount),
    nearBudgetCount: String(input.budgetNearLimitCount),
    anomalyCount: String(input.anomalyCount),
  };

  const summaryPool = buildPool(
    bank.adviceSummaries,
    triggeredCategories,
    bank.generic.adviceSummaries,
  );
  const findingsPool = buildPool(bank.findings, triggeredCategories, bank.generic.findings);
  const actionsPool = buildPool(bank.actions, triggeredCategories, bank.generic.actions);

  const summaryPick = pickUniqueTemplates({
    pool: summaryPool,
    count: 1,
    rand,
    tokens,
    fallbackLine: fallbackSummary(language),
  });
  const findingsPick = pickUniqueTemplates({
    pool: findingsPool,
    count: clampInt(triggeredCategories.length, 3, 5),
    rand,
    tokens,
    fallbackLine: fallbackFinding(language),
  });
  const actionsPick = pickUniqueTemplates({
    pool: actionsPool,
    count: clampInt(triggeredCategories.length, 3, 5),
    rand,
    tokens,
    fallbackLine: fallbackAction(language),
  });

  const warnings = buildWarnings(language, input, tokens);
  const tipsPool = [...bank.generic.findings, ...bank.generic.actions];
  const tipsPick = pickUniqueTemplates({
    pool: tipsPool,
    count: 4,
    rand,
    tokens,
    fallbackLine: fallbackAction(language),
  });

  const weeklyActions = dedupeKeepOrder(actionsPick.lines).slice(0, 3);

  const recommendedTransfer = formatCurrency(
    Math.max(0, input.currentMonthIncome * Math.max(0, input.savingsTargetRate) / 100),
    input.currency,
    language,
  );

  const autoTransferSuggestion = language === 'tr'
    ? `Gelir gününde ${recommendedTransfer} tutarını otomatik birikim hesabına aktaracak kural tanımla.`
    : language === 'ru'
      ? `В день поступления дохода настрой автоматический перевод ${recommendedTransfer} на счёт накоплений.`
      : `Set an automatic transfer of ${recommendedTransfer} to savings on each income day.`;

  const investmentGuidanceBase = language === 'tr'
    ? [
        'Yatırım tarafında kademeli alım yaklaşımını koruyup tek noktadan yoğun girişten kaçın.',
        'Likidite tamponunu korurken düşük maliyetli ve geniş dağılımlı araçları önceliklendir.',
        'Çeyreklik periyotlarda portföy dengesini kontrol ederek risk yoğunlaşmasını azalt.',
        'Getiri beklentisini değil, dalgalanma toleransını da planın merkezine koy.',
      ]
    : language === 'ru'
      ? [
          'Сохраняй поэтапный вход в инвестиции и избегай концентрации в одной точке.',
          'Поддерживай ликвидный резерв и делай ставку на диверсифицированные инструменты.',
          'Пересматривай структуру портфеля поквартально, чтобы не накапливать перекос риска.',
          'Оценивай не только ожидаемую доходность, но и допустимую волатильность.',
        ]
      : [
          'Keep a phased investing cadence instead of single concentrated entries.',
          'Protect liquidity buffers while prioritizing diversified, low-cost instruments.',
          'Rebalance quarterly to avoid silent risk concentration in one segment.',
          'Plan for volatility tolerance, not only expected returns.',
        ];
  const investmentGuidance = pickStatic(investmentGuidanceBase, 3, rand);

  const quickWinsBase = language === 'tr'
    ? [
        'Bu hafta düşük kullanımda kalan bir aboneliği askıya al.',
        'Dürtüsel harcamalar için 24 saat bekleme kuralı uygula.',
        'Kategori bazında en sık tekrarlanan küçük harcamayı bir seviye azalt.',
        'Haftalık harcama özeti için sabit bir kontrol zamanı belirle.',
        'Limit eşiğine yaklaşan kategoride işlem başı üst sınır koy.',
      ]
    : language === 'ru'
      ? [
          'На этой неделе приостанови одну подписку с низкой фактической пользой.',
          'Для импульсных покупок применяй правило паузы 24 часа.',
          'Сократи частоту самой повторяющейся мелкой траты в одной категории.',
          'Назначь фиксированное время для недельного обзора расходов.',
          'В категории близкой к лимиту введи верхний порог на одну операцию.',
        ]
      : [
          'Pause one low-utility subscription this week.',
          'Use a 24-hour pause rule for impulse purchases.',
          'Reduce the most repetitive small expense in one category.',
          'Set a fixed time for your weekly spending review.',
          'Add a per-transaction cap in the category nearest to limit.',
        ];
  const quickWins = pickStatic(quickWinsBase, 3, rand);

  const findingDiagnostics: ManualFindingDiagnostic[] = triggeredCategories
    .slice(0, 6)
    .map((category) => ({
      category,
      severity: resolveSeverity(category, input),
      facts: resolveFacts(category, input),
    }));

  return {
    triggeredCategories,
    variantSeedSource: seedSource,
    variantKey,
    variantNoncePresent: noncePresent,
    selectedTemplateIndexes: {
      summary: summaryPick.indexes[0] ?? -1,
      findings: findingsPick.indexes,
      actions: actionsPick.indexes,
    },
    findings: findingDiagnostics,
    advice: {
      summary: summaryPick.lines[0] ?? fallbackSummary(language),
      topFindings: dedupeKeepOrder(findingsPick.lines).slice(0, 8),
      suggestedActions: dedupeKeepOrder(actionsPick.lines).slice(0, 8),
      warnings,
      tips: dedupeKeepOrder(tipsPick.lines).slice(0, 10),
      next7DaysActions: weeklyActions,
      autoTransferSuggestion,
      investmentGuidance: dedupeKeepOrder(investmentGuidance).slice(0, 8),
      quickWins: dedupeKeepOrder(quickWins).slice(0, 8),
    },
  };
}

