import type { AiInsightsLanguage } from '@mintly/shared';

import { templateBankEn } from './en.js';
import { templateBankRu } from './ru.js';
import { templateBankTr } from './tr.js';
import type { AdvisorTemplateLanguage, TemplateBank } from './types.js';

function normalizeRawLanguage(language: string | null | undefined): AdvisorTemplateLanguage | null {
  if (!language) {
    return null;
  }

  const normalized = language.trim().toLowerCase();
  if (normalized === 'tr' || normalized.startsWith('tr-')) {
    return 'tr';
  }
  if (normalized === 'ru' || normalized.startsWith('ru-')) {
    return 'ru';
  }
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return 'en';
  }

  return null;
}

export function normalizeTemplateLanguage(
  language: AiInsightsLanguage | string | null | undefined,
): AdvisorTemplateLanguage {
  return normalizeRawLanguage(language) ?? 'en';
}

export function getTemplateBank(language: AiInsightsLanguage | string | null | undefined): TemplateBank {
  const normalized = normalizeTemplateLanguage(language);

  if (normalized === 'tr') {
    return templateBankTr;
  }
  if (normalized === 'ru') {
    return templateBankRu;
  }
  if (normalized === 'en') {
    return templateBankEn;
  }

  // Safety fallback chain: requested -> en -> tr
  return templateBankEn ?? templateBankTr;
}

export type { CategoryKey, TemplateBank } from './types.js';

