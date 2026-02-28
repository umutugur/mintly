import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { createElement, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';

import en from './locales/en.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';
import { translationOverrides } from './overrides';

export type SupportedLocale = 'tr' | 'en' | 'ru';

const LANGUAGE_STORAGE_KEY = 'finsight:language';
const DEFAULT_LOCALE: SupportedLocale = 'en';
const missingKeyLogCache = new Set<string>();

function inferScreenNameFromStack(stack?: string): string {
  if (!stack) {
    return 'unknown-screen';
  }

  const lines = stack.split('\n');
  for (const line of lines) {
    const match = line.match(/([A-Za-z0-9_]+Screen)\.(tsx|ts)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  for (const line of lines) {
    const match = line.match(/([A-Za-z0-9_]+Screen)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return 'unknown-screen';
}

function reportMissingTranslationKey(params: {
  key: string;
  locale: SupportedLocale;
}) {
  const screen = inferScreenNameFromStack(new Error().stack);
  const fingerprint = `${params.locale}:${params.key}:${screen}`;
  if (missingKeyLogCache.has(fingerprint)) {
    return;
  }

  missingKeyLogCache.add(fingerprint);

  const message = `[i18n] Missing translation key "${params.key}" for locale "${params.locale}" on "${screen}"`;
  if (__DEV__) {
    console.error(message);
    return;
  }

  console.warn(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeTranslations(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = merged[key];

    if (isObject(baseValue) && isObject(overrideValue)) {
      merged[key] = mergeTranslations(baseValue, overrideValue);
      continue;
    }

    merged[key] = overrideValue;
  }

  return merged;
}

const resources = {
  tr: {
    translation: mergeTranslations(tr as Record<string, unknown>, translationOverrides.tr as Record<string, unknown>),
  },
  en: {
    translation: mergeTranslations(en as Record<string, unknown>, translationOverrides.en as Record<string, unknown>),
  },
  ru: {
    translation: mergeTranslations(ru as Record<string, unknown>, translationOverrides.ru as Record<string, unknown>),
  },
} as const;

let initPromise: Promise<void> | null = null;

function syncResourceBundles(): void {
  (Object.entries(resources) as Array<[SupportedLocale, { translation: Record<string, unknown> }]>).forEach(
    ([locale, resource]) => {
      i18n.addResourceBundle(locale, 'translation', resource.translation, true, true);
    },
  );
}

if (i18n.isInitialized) {
  syncResourceBundles();
}

function normalizeLocale(locale: string | null | undefined): SupportedLocale {
  if (!locale) {
    return DEFAULT_LOCALE;
  }

  const lowered = locale.toLowerCase();
  if (lowered.startsWith('tr')) {
    return 'tr';
  }

  if (lowered.startsWith('ru')) {
    return 'ru';
  }

  return 'en';
}

function detectDeviceLocale(): SupportedLocale {
  const locale = Localization.getLocales()[0]?.languageCode;
  return normalizeLocale(locale);
}

async function initI18n(): Promise<void> {
  if (i18n.isInitialized) {
    syncResourceBundles();
    return;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      const locale = normalizeLocale(stored ?? detectDeviceLocale());

      await i18n.use(initReactI18next).init({
        resources,
        lng: locale,
        fallbackLng: false,
        interpolation: { escapeValue: false },
        compatibilityJSON: 'v4',
        returnNull: false,
        returnEmptyString: false,
        parseMissingKeyHandler: () => '',
      });

      syncResourceBundles();
    })();
  }

  await initPromise;
}

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(i18n.isInitialized);

  useEffect(() => {
    let mounted = true;

    void initI18n().finally(() => {
      if (mounted) {
        setReady(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return null;
  }

  return createElement(I18nextProvider, { i18n }, children);
}

export function useI18n(): I18nContextValue {
  const { t, i18n: instance } = useTranslation();

  const locale = normalizeLocale(instance.resolvedLanguage ?? instance.language);

  const setLocale = useCallback(async (nextLocale: SupportedLocale) => {
    const normalized = normalizeLocale(nextLocale);
    await instance.changeLanguage(normalized);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  }, [instance]);

  const translate = useCallback((key: string, params?: Record<string, string | number>) => {
    const activeLocale = normalizeLocale(instance.resolvedLanguage ?? instance.language);
    const hasKeyInActiveLocale = instance.exists(key, {
      lng: activeLocale,
      fallbackLng: false,
    });

    if (!hasKeyInActiveLocale) {
      reportMissingTranslationKey({ key, locale: activeLocale });
      return '';
    }

    const translated = t(key, {
      ...params,
      lng: activeLocale,
      defaultValue: '',
    });

    if (!translated || translated === key) {
      reportMissingTranslationKey({ key, locale: activeLocale });
      return '';
    }

    return translated;
  }, [instance, t]);

  return useMemo(() => ({
    locale,
    setLocale,
    t: translate,
  }), [locale, setLocale, translate]);
}

export { LANGUAGE_STORAGE_KEY };
