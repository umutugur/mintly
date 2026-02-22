import i18n from 'i18next';

import { normalizeApiErrorForUi } from './normalizeApiError';

export function apiErrorText(error: unknown): string {
  const normalized = normalizeApiErrorForUi(error);
  return i18n.t(normalized.translationKey, {
    defaultValue: i18n.t('errors.api.UNKNOWN_ERROR'),
  });
}
