const LOCALE_STORAGE_KEY = 'montly_admin_locale';
const LEGACY_LOCALE_STORAGE_KEYS = ['i18nextLng'] as const;
const DEFAULT_LOCALE = 'tr-TR';

let currentLocale = DEFAULT_LOCALE;
let activeStorageKey = LOCALE_STORAGE_KEY;

export function getLocaleStorageKey(): string {
  return activeStorageKey;
}

export function getDefaultLocale(): string {
  return DEFAULT_LOCALE;
}

export function readPreferredLocale(): string {
  if (typeof window === 'undefined') {
    return currentLocale;
  }

  for (const key of [LOCALE_STORAGE_KEY, ...LEGACY_LOCALE_STORAGE_KEYS]) {
    const stored = window.localStorage.getItem(key);
    if (stored && stored.trim().length > 0) {
      activeStorageKey = key;
      currentLocale = stored;
      return currentLocale;
    }
  }

  activeStorageKey = LOCALE_STORAGE_KEY;
  currentLocale = DEFAULT_LOCALE;
  window.localStorage.setItem(activeStorageKey, currentLocale);
  return currentLocale;
}

export function setPreferredLocale(nextLocale: string): void {
  const normalized = nextLocale.trim() || DEFAULT_LOCALE;
  currentLocale = normalized;

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(activeStorageKey, normalized);
  }
}

export function getPreferredLocale(): string {
  return currentLocale;
}
