import i18n from 'i18next';

import { normalizeApiErrorForUi } from './normalizeApiError';

export function apiErrorText(error: unknown): string {
  const normalized = normalizeApiErrorForUi(error);
  const unknownMessage = i18n.t('errors.api.UNKNOWN_ERROR');
  const translated = i18n.t(normalized.translationKey, {
    defaultValue: unknownMessage,
  });

  if (normalized.translationKey === 'errors.api.UNKNOWN_ERROR' && normalized.message.trim().length > 0) {
    return normalized.message;
  }

  if (
    translated === unknownMessage &&
    normalized.code !== 'UNKNOWN_ERROR' &&
    normalized.message.trim().length > 0
  ) {
    return normalized.message;
  }

  return translated;
}
