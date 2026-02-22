import { useCallback } from 'react';

import en from './locales/en.json';
import { useI18n } from './index';

type NestedTranslationKey<T> = {
  [K in Extract<keyof T, string>]:
    T[K] extends string
      ? K
      : T[K] extends Record<string, unknown>
        ? `${K}.${NestedTranslationKey<T[K]>}`
        : never;
}[Extract<keyof T, string>];

export type TranslationKey = NestedTranslationKey<typeof en>;
export type TranslationParams = Record<string, string | number>;

export function useT() {
  const { t } = useI18n();

  return useCallback(
    (key: TranslationKey | string, params?: TranslationParams) => t(key, params),
    [t],
  );
}
