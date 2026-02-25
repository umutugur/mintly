import type { UpcomingPaymentType } from '@mintly/shared';

const DUE_KEYWORD_REGEX = /(son\s+odeme|son\s+ödeme|due|vade|odeme\s+tarihi|ödeme\s+tarihi|payment\s+due)/i;
const RECEIPT_DATE_HINT_REGEX = /(tarih|date|receipt\s+date|islem\s+tarihi|işlem\s+tarihi)/i;
const AMOUNT_HINT_REGEX = /(toplam|total|tutar|amount|odenecek|ödenecek|genel\s+toplam|ara\s+toplam)/i;
const RECURRING_HINT_REGEX = /(abonelik|subscription|aidat|kira|rent|membership|monthly|haftalik|haftalık|weekly)/i;
const FUEL_HINT_REGEX = /(fuel|akaryakit|akaryakıt|benzin|diesel|petrol|shell|opet|bp)/i;
const GROCERY_HINT_REGEX = /(market|migros|carrefour|bim|a101|grocery|supermarket|gida|gıda|yemek|food)/i;

const CURRENCY_PATTERNS: Array<{ code: string; regex: RegExp }> = [
  { code: 'TRY', regex: /(₺|\bTRY\b|\bTL\b)/i },
  { code: 'USD', regex: /(\$|\bUSD\b)/i },
  { code: 'EUR', regex: /(€|\bEUR\b)/i },
  { code: 'GBP', regex: /(£|\bGBP\b)/i },
  { code: 'RUB', regex: /(₽|\bRUB\b)/i },
];

interface DateToken {
  index: number;
  isoDate: string;
}

export type ScanClassification = 'expense' | 'bill' | 'recurring';
export type ScanCategoryHint = 'fuel' | 'grocery' | null;

export interface ParsedReceiptDraft {
  title: string;
  amount: string;
  occurredDate: string;
  dueDate: string | null;
  upcomingType: UpcomingPaymentType;
  mode: 'upcoming' | 'transaction';
  classificationHint: ScanClassification;
  categoryHint: ScanCategoryHint;
  detectedCurrency: string | null;
  currencyWarning: boolean;
  parseConfidence: number;
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00A0/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function normalizeDatePart(part: number): string {
  return String(part).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${normalizeDatePart(month)}-${normalizeDatePart(day)}`;
}

function extractDateTokens(rawText: string): DateToken[] {
  const tokens: DateToken[] = [];

  const patternYmd = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  const patternDmy = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g;

  for (const match of rawText.matchAll(patternYmd)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const isoDate = toIsoDate(year, month, day);

    if (!isoDate || match.index === undefined) {
      continue;
    }

    tokens.push({ index: match.index, isoDate });
  }

  for (const match of rawText.matchAll(patternDmy)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const isoDate = toIsoDate(year, month, day);

    if (!isoDate || match.index === undefined) {
      continue;
    }

    tokens.push({ index: match.index, isoDate });
  }

  return tokens.sort((a, b) => a.index - b.index);
}

function parseFlexibleAmountToken(token: string): number | null {
  const value = token.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
  if (!value || value === '.' || value === ',') {
    return null;
  }

  const hasComma = value.includes(',');
  const hasDot = value.includes('.');
  let normalized = value;

  if (hasComma && hasDot) {
    const lastComma = value.lastIndexOf(',');
    const lastDot = value.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';

    normalized = normalized.split(thousandSep).join('');
    normalized = normalized.replace(decimalSep, '.');
  } else if (hasComma) {
    const parts = normalized.split(',');
    if (parts.length === 2 && parts[1]?.length <= 2) {
      normalized = `${parts[0] ?? '0'}.${parts[1] ?? '0'}`;
    } else {
      normalized = normalized.split(',').join('');
    }
  } else if (hasDot) {
    const parts = normalized.split('.');
    if (!(parts.length === 2 && (parts[1]?.length ?? 0) <= 2)) {
      normalized = normalized.split('.').join('');
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function extractAmount(rawText: string): number | null {
  const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean);
  let best: { score: number; amount: number } | null = null;

  for (const line of lines) {
    const matches = line.match(/\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})|\d+(?:[.,]\d{1,2})/g) ?? [];

    for (const match of matches) {
      const parsed = parseFlexibleAmountToken(match);
      if (!parsed) {
        continue;
      }

      if (parsed > 100_000_000) {
        continue;
      }

      let score = parsed;
      if (AMOUNT_HINT_REGEX.test(line)) {
        score += 1_000_000;
      }
      if (/[.,]\d{2}\b/.test(match)) {
        score += 10_000;
      }

      if (!best || score > best.score) {
        best = { score, amount: parsed };
      }
    }
  }

  return best?.amount ?? null;
}

function inferUpcomingType(rawText: string): UpcomingPaymentType {
  const normalized = rawText.toLowerCase();

  if (/(rent|kira|аренд)/i.test(normalized)) {
    return 'rent';
  }
  if (/(subscription|abonelik|подпис)/i.test(normalized)) {
    return 'subscription';
  }
  if (/(debt|borc|borç|долг)/i.test(normalized)) {
    return 'debt';
  }

  return 'bill';
}

function extractTitle(rawText: string): string {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    if (/\d/.test(line) && line.length < 4) {
      continue;
    }

    if (line.length <= 2) {
      continue;
    }

    if (AMOUNT_HINT_REGEX.test(line) || DUE_KEYWORD_REGEX.test(line)) {
      continue;
    }

    return line.slice(0, 80);
  }

  return '';
}

function detectCurrency(rawText: string): string | null {
  for (const item of CURRENCY_PATTERNS) {
    if (item.regex.test(rawText)) {
      return item.code;
    }
  }

  return null;
}

function pickReceiptDate(rawText: string, dateTokens: DateToken[], nowIsoDate: string): string {
  if (dateTokens.length === 0) {
    return nowIsoDate;
  }

  const hintMatch = RECEIPT_DATE_HINT_REGEX.exec(rawText);
  if (!hintMatch || hintMatch.index === undefined) {
    return dateTokens[0]?.isoDate ?? nowIsoDate;
  }

  const hintIndex = hintMatch.index;
  const closest = dateTokens
    .map((token) => ({ token, distance: Math.abs(token.index - hintIndex) }))
    .sort((a, b) => a.distance - b.distance)[0]?.token;

  return closest?.isoDate ?? (dateTokens[0]?.isoDate ?? nowIsoDate);
}

function pickDueDate(rawText: string, dateTokens: DateToken[]): string | null {
  if (dateTokens.length === 0) {
    return null;
  }

  const dueMatch = DUE_KEYWORD_REGEX.exec(rawText);
  if (!dueMatch || dueMatch.index === undefined) {
    return null;
  }

  const dueIndex = dueMatch.index;

  const afterKeyword = dateTokens
    .filter((token) => token.index >= dueIndex)
    .sort((a, b) => a.index - b.index)[0];

  if (afterKeyword) {
    return afterKeyword.isoDate;
  }

  const closest = dateTokens
    .map((token) => ({ token, distance: Math.abs(token.index - dueIndex) }))
    .sort((a, b) => a.distance - b.distance)[0]?.token;

  return closest?.isoDate ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeParseConfidence(params: {
  rawText: string;
  title: string;
  amount: number | null;
  dateTokenCount: number;
  detectedCurrency: string | null;
  dueDate: string | null;
  hasRecurringHint: boolean;
}): number {
  let confidence = 0.1;

  if (params.rawText.length >= 40) {
    confidence += 0.12;
  }

  if (params.title.trim().length > 0) {
    confidence += 0.2;
  }

  if (params.amount !== null) {
    confidence += 0.34;
  }

  if (params.dateTokenCount > 0) {
    confidence += 0.18;
  }

  if (params.detectedCurrency) {
    confidence += 0.08;
  }

  if (params.dueDate) {
    confidence += 0.06;
  }

  if (params.hasRecurringHint) {
    confidence += 0.04;
  }

  return Number(clamp(confidence, 0.05, 0.98).toFixed(2));
}

export function parseReceiptText(input: {
  rawText: string;
  baseCurrency: string;
  now?: Date;
}): ParsedReceiptDraft {
  const cleanedText = normalizeText(input.rawText);
  const now = input.now ?? new Date();
  const nowIsoDate = `${now.getUTCFullYear()}-${normalizeDatePart(now.getUTCMonth() + 1)}-${normalizeDatePart(now.getUTCDate())}`;

  const dateTokens = extractDateTokens(cleanedText);
  const dueDate = pickDueDate(cleanedText, dateTokens);
  const occurredDate = pickReceiptDate(cleanedText, dateTokens, nowIsoDate);
  const amount = extractAmount(cleanedText);
  const detectedCurrency = detectCurrency(cleanedText);
  const upcomingType = inferUpcomingType(cleanedText);
  const title = extractTitle(cleanedText);
  const hasDueHint = DUE_KEYWORD_REGEX.test(cleanedText) || Boolean(dueDate);
  const hasRecurringHint = RECURRING_HINT_REGEX.test(cleanedText);

  const classificationHint: ScanClassification = hasRecurringHint
    ? 'recurring'
    : hasDueHint
      ? 'bill'
      : 'expense';

  const categoryHint: ScanCategoryHint = FUEL_HINT_REGEX.test(cleanedText)
    ? 'fuel'
    : GROCERY_HINT_REGEX.test(cleanedText)
      ? 'grocery'
      : null;

  const normalizedBaseCurrency = input.baseCurrency.trim().toUpperCase();
  const parseConfidence = computeParseConfidence({
    rawText: cleanedText,
    title,
    amount,
    dateTokenCount: dateTokens.length,
    detectedCurrency,
    dueDate,
    hasRecurringHint,
  });

  return {
    title,
    amount: amount ? amount.toFixed(2) : '',
    occurredDate,
    dueDate,
    upcomingType,
    mode: dueDate ? 'upcoming' : 'transaction',
    classificationHint,
    categoryHint,
    detectedCurrency,
    currencyWarning:
      Boolean(detectedCurrency) &&
      detectedCurrency !== normalizedBaseCurrency,
    parseConfidence,
  };
}
