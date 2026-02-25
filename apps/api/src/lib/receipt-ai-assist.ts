import {
  aiReceiptParseResponseSchema,
  type AiInsightsLanguage,
  type AiReceiptParseResponse,
} from '@mintly/shared';
import { z } from 'zod';

import { getConfig } from '../config.js';
import { CloudflareProviderError, generateCloudflareText } from './ai/cloudflare.js';

const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_CACHE_SIZE = 600;
const MAX_PROMPT_TEXT_LENGTH = 6000;

const CURRENCY_PATTERNS: Array<{ code: string; regex: RegExp }> = [
  { code: 'TRY', regex: /(₺|\bTRY\b|\bTL\b)/i },
  { code: 'USD', regex: /(\$|\bUSD\b)/i },
  { code: 'EUR', regex: /(€|\bEUR\b)/i },
  { code: 'GBP', regex: /(£|\bGBP\b)/i },
  { code: 'RUB', regex: /(₽|\bRUB\b)/i },
];

interface ParseReceiptWithAiAssistInput {
  userId: string;
  rawText: string;
  locale: AiInsightsLanguage;
  currencyHint: string | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface CacheEntry {
  expiresAt: number;
  value: AiReceiptParseResponse;
}

const receiptParseCache = new Map<string, CacheEntry>();

const providerOutputSchema = z.object({
  merchant: z.string().trim().max(120).nullable().optional(),
  date: z.string().trim().nullable().optional(),
  amount: z.union([z.number(), z.string()]).nullable().optional(),
  currency: z.string().trim().nullable().optional(),
  categorySuggestion: z.string().trim().max(40).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00A0/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }

  return hash.toString(16);
}

function cleanupExpiredCache(now = Date.now()): void {
  for (const [key, entry] of receiptParseCache.entries()) {
    if (entry.expiresAt <= now) {
      receiptParseCache.delete(key);
    }
  }
}

function normalizeDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
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

function parseDateFromText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const ymd = trimmed.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (ymd) {
    return toIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  const dmy = trimmed.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (dmy) {
    return toIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  const parsedTime = Date.parse(trimmed);
  if (Number.isNaN(parsedTime)) {
    return null;
  }

  const parsed = new Date(parsedTime);
  return toIsoDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
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
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10000000) {
    return null;
  }

  return roundCurrency(parsed);
}

function parseAmountFromUnknown(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > 10000000) {
      return null;
    }
    return roundCurrency(value);
  }

  if (typeof value === 'string') {
    return parseFlexibleAmountToken(value);
  }

  return null;
}

function extractAmountFromText(rawText: string): number | null {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let best: { score: number; amount: number } | null = null;

  for (const line of lines) {
    const matches = line.match(/\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})|\d+(?:[.,]\d{1,2})/g) ?? [];
    for (const match of matches) {
      const parsed = parseFlexibleAmountToken(match);
      if (!parsed) {
        continue;
      }

      let score = parsed;
      if (/(toplam|total|tutar|amount|odenecek|ödenecek|genel\s+toplam|ara\s+toplam)/i.test(line)) {
        score += 1000000;
      }
      if (/[.,]\d{2}\b/.test(match)) {
        score += 10000;
      }

      if (!best || score > best.score) {
        best = { score, amount: parsed };
      }
    }
  }

  return best?.amount ?? null;
}

function normalizeCurrencyCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) {
    return upper;
  }

  if (upper === 'TL') {
    return 'TRY';
  }

  if (upper === '$') {
    return 'USD';
  }

  if (upper === '€') {
    return 'EUR';
  }

  if (upper === '£') {
    return 'GBP';
  }

  if (upper === '₽') {
    return 'RUB';
  }

  return null;
}

function detectCurrencyFromText(rawText: string): string | null {
  for (const item of CURRENCY_PATTERNS) {
    if (item.regex.test(rawText)) {
      return item.code;
    }
  }

  return null;
}

function normalizeCategorySuggestion(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return null;
  }

  if (/(fuel|akaryak|benzin|petrol|diesel|shell|opet|bp)/i.test(normalized)) {
    return 'fuel';
  }

  if (/(grocery|market|food|supermarket|migros|carrefour|bim|a101|gida|gıda|yemek)/i.test(normalized)) {
    return 'grocery';
  }

  if (/(rent|kira|аренд)/i.test(normalized)) {
    return 'rent';
  }

  if (/(subscription|abonelik|подпис)/i.test(normalized)) {
    return 'subscription';
  }

  if (/(transport|ulasim|ulaşım|taxi|uber|metro|bus)/i.test(normalized)) {
    return 'transport';
  }

  return normalized.slice(0, 40);
}

function inferCategoryFromText(rawText: string): string | null {
  if (/(fuel|akaryakit|akaryakıt|benzin|diesel|petrol|shell|opet|bp)/i.test(rawText)) {
    return 'fuel';
  }

  if (/(market|migros|carrefour|bim|a101|grocery|supermarket|gida|gıda|food|yemek)/i.test(rawText)) {
    return 'grocery';
  }

  if (/(rent|kira|аренд)/i.test(rawText)) {
    return 'rent';
  }

  if (/(subscription|abonelik|подпис)/i.test(rawText)) {
    return 'subscription';
  }

  if (/(transport|ulasim|ulaşım|taxi|uber|metro|bus)/i.test(rawText)) {
    return 'transport';
  }

  return null;
}

function extractMerchant(rawText: string): string | null {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 1);

  for (const line of lines) {
    if (/^\d+$/.test(line)) {
      continue;
    }

    if (/(toplam|total|tutar|amount|vade|due|odeme|ödeme)/i.test(line)) {
      continue;
    }

    if (line.length > 80) {
      continue;
    }

    return line.slice(0, 120);
  }

  return null;
}

function sanitizePromptText(rawText: string): string {
  const redacted = rawText
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, '[redacted-iban]')
    .replace(/\b\d{9,}\b/g, '[redacted-number]');

  return normalizeWhitespace(redacted).slice(0, MAX_PROMPT_TEXT_LENGTH);
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

function buildPrompt(input: {
  locale: AiInsightsLanguage;
  currencyHint: string | null;
  rawText: string;
}): string {
  const languageName =
    input.locale === 'tr' ? 'Turkish' : input.locale === 'ru' ? 'Russian' : 'English';

  return [
    'You extract structured receipt fields from OCR text.',
    `Write merchant/category text in ${languageName}.`,
    'Privacy constraints:',
    '- Never include user identifiers, emails, account IDs, transaction IDs, or any metadata not in OCR text.',
    '- Do not infer person names or account numbers.',
    'Return strict JSON only with this shape:',
    '{"merchant":"string|null","date":"YYYY-MM-DD|null","amount":123.45,"currency":"ISO4217|null","categorySuggestion":"string|null","confidence":0.0}',
    'Rules:',
    '- Use null for missing fields.',
    '- date must be YYYY-MM-DD.',
    '- amount must be positive decimal when present.',
    '- confidence must be between 0 and 1.',
    `- Prefer currencyHint "${input.currencyHint ?? 'null'}" only when OCR text is ambiguous.`,
    '- No markdown, no extra keys, no explanation.',
    `OCR text:\n${input.rawText}`,
  ].join('\n');
}

function countKnownFields(result: Pick<AiReceiptParseResponse, 'merchant' | 'date' | 'amount' | 'currency' | 'categorySuggestion'>): number {
  let count = 0;
  if (result.merchant) {
    count += 1;
  }
  if (result.date) {
    count += 1;
  }
  if (result.amount !== null) {
    count += 1;
  }
  if (result.currency) {
    count += 1;
  }
  if (result.categorySuggestion) {
    count += 1;
  }
  return count;
}

function buildHeuristicResult(rawText: string, currencyHint: string | null): AiReceiptParseResponse {
  const merchant = extractMerchant(rawText);
  const amount = extractAmountFromText(rawText);
  const date = parseDateFromText(rawText);
  const detectedCurrency = detectCurrencyFromText(rawText);
  const categorySuggestion = inferCategoryFromText(rawText);

  let confidence = 0.12;
  if (merchant) {
    confidence += 0.2;
  }
  if (amount !== null) {
    confidence += 0.34;
  }
  if (date) {
    confidence += 0.2;
  }
  if (detectedCurrency || currencyHint) {
    confidence += 0.08;
  }
  if (categorySuggestion) {
    confidence += 0.08;
  }
  if (rawText.length >= 100) {
    confidence += 0.08;
  }

  return aiReceiptParseResponseSchema.parse({
    merchant,
    date,
    amount,
    currency: detectedCurrency ?? currencyHint,
    categorySuggestion,
    confidence: clamp(confidence, 0.05, 0.9),
    source: 'heuristic',
    cacheHit: false,
  });
}

function buildCacheKey(input: {
  userId: string;
  locale: AiInsightsLanguage;
  currencyHint: string | null;
  promptSafeText: string;
}): string {
  return [
    input.userId,
    input.locale,
    input.currencyHint ?? 'none',
    stableHash(input.promptSafeText),
  ].join('|');
}

function mergeHeuristicAndAiResults(
  heuristic: AiReceiptParseResponse,
  aiResult: AiReceiptParseResponse,
  currencyHint: string | null,
): AiReceiptParseResponse {
  const merged = {
    merchant: aiResult.merchant ?? heuristic.merchant,
    date: aiResult.date ?? heuristic.date,
    amount: aiResult.amount ?? heuristic.amount,
    currency: aiResult.currency ?? heuristic.currency ?? currencyHint,
    categorySuggestion: aiResult.categorySuggestion ?? heuristic.categorySuggestion,
  };

  const aiFields = countKnownFields(aiResult);
  const heuristicFields = countKnownFields(heuristic);
  const preferAi = aiResult.confidence >= heuristic.confidence || aiFields > heuristicFields;
  const baseConfidence = Math.max(aiResult.confidence, heuristic.confidence);

  return aiReceiptParseResponseSchema.parse({
    ...merged,
    confidence: clamp(baseConfidence, 0.05, 0.99),
    source: preferAi ? 'ai' : 'heuristic',
    cacheHit: false,
  });
}

function coerceProviderOutput(params: {
  candidate: z.infer<typeof providerOutputSchema>;
  rawText: string;
  currencyHint: string | null;
}): AiReceiptParseResponse | null {
  const merchant = params.candidate.merchant?.trim() ? params.candidate.merchant.trim() : null;
  const date = parseDateFromText(params.candidate.date ?? '');
  const amount = parseAmountFromUnknown(params.candidate.amount);
  const aiCurrency = normalizeCurrencyCode(params.candidate.currency ?? null);
  const textCurrency = detectCurrencyFromText(params.rawText);
  const currency = aiCurrency ?? textCurrency ?? params.currencyHint;
  const categorySuggestion = normalizeCategorySuggestion(params.candidate.categorySuggestion ?? null);

  let confidence = params.candidate.confidence ?? 0.62;
  if (!merchant) {
    confidence -= 0.12;
  }
  if (amount === null) {
    confidence -= 0.28;
  }
  if (!date) {
    confidence -= 0.12;
  }
  if (!currency) {
    confidence -= 0.06;
  }
  if (!categorySuggestion) {
    confidence -= 0.04;
  }

  const parsed = aiReceiptParseResponseSchema.safeParse({
    merchant,
    date,
    amount,
    currency,
    categorySuggestion,
    confidence: clamp(confidence, 0.05, 0.99),
    source: 'ai',
    cacheHit: false,
  });

  return parsed.success ? parsed.data : null;
}

async function tryParseWithAi(
  input: {
    locale: AiInsightsLanguage;
    currencyHint: string | null;
    promptSafeText: string;
    rawText: string;
  },
  fetchImpl: FetchLike,
): Promise<AiReceiptParseResponse | null> {
  const config = getConfig();
  if (!config.cloudflareAuthToken || !config.cloudflareAccountId || !config.cloudflareAiModel) {
    return null;
  }

  const prompt = buildPrompt({
    locale: input.locale,
    currencyHint: input.currencyHint,
    rawText: input.promptSafeText,
  });

  try {
    const providerResult = await generateCloudflareText(
      {
        apiToken: config.cloudflareAuthToken,
        accountId: config.cloudflareAccountId,
        model: config.cloudflareAiModel,
        timeoutMs: config.cloudflareHttpTimeoutMs,
        maxAttempts: Math.max(1, config.cloudflareMaxAttempts),
        maxTokens: 320,
        temperature: 0.1,
        systemPrompt:
          'Return one strict RFC8259 JSON object only. No markdown, no explanations, no trailing commas.',
        userPrompt: prompt,
      },
      fetchImpl,
    );

    const rawProviderPayload = parseStrictJsonPayload(providerResult.text);
    const parsedProviderOutput = providerOutputSchema.safeParse(rawProviderPayload);
    if (!parsedProviderOutput.success) {
      return null;
    }

    return coerceProviderOutput({
      candidate: parsedProviderOutput.data,
      rawText: input.rawText,
      currencyHint: input.currencyHint,
    });
  } catch (error) {
    if (error instanceof CloudflareProviderError) {
      return null;
    }

    return null;
  }
}

export async function parseReceiptWithAiAssist(
  input: ParseReceiptWithAiAssistInput,
  fetchImpl: FetchLike = (requestUrl, init) => fetch(requestUrl, init),
): Promise<AiReceiptParseResponse> {
  const normalizedRawText = normalizeWhitespace(input.rawText);
  const normalizedCurrencyHint = normalizeCurrencyCode(input.currencyHint) ?? null;
  const promptSafeText = sanitizePromptText(normalizedRawText);
  const cacheKey = buildCacheKey({
    userId: input.userId,
    locale: input.locale,
    currencyHint: normalizedCurrencyHint,
    promptSafeText,
  });

  cleanupExpiredCache();
  const now = Date.now();
  const cached = receiptParseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return aiReceiptParseResponseSchema.parse({
      ...cached.value,
      cacheHit: true,
    });
  }

  const heuristicResult = buildHeuristicResult(normalizedRawText, normalizedCurrencyHint);
  const aiResult = await tryParseWithAi(
    {
      locale: input.locale,
      currencyHint: normalizedCurrencyHint,
      promptSafeText,
      rawText: normalizedRawText,
    },
    fetchImpl,
  );

  const mergedResult = aiResult
    ? mergeHeuristicAndAiResults(heuristicResult, aiResult, normalizedCurrencyHint)
    : heuristicResult;

  const finalResult = aiReceiptParseResponseSchema.parse({
    ...mergedResult,
    cacheHit: false,
  });

  if (receiptParseCache.size >= MAX_CACHE_SIZE) {
    cleanupExpiredCache(now);
    if (receiptParseCache.size >= MAX_CACHE_SIZE) {
      const firstKey = receiptParseCache.keys().next().value as string | undefined;
      if (firstKey) {
        receiptParseCache.delete(firstKey);
      }
    }
  }

  receiptParseCache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    value: finalResult,
  });

  return finalResult;
}

export function clearReceiptAiAssistCacheForTests(): void {
  receiptParseCache.clear();
}
