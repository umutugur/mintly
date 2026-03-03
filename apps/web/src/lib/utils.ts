import { format, parseISO, subDays } from 'date-fns';
import clsx from 'clsx';

import { getPreferredLocale } from './locale';

export interface DateRangeValue {
  from: string;
  to: string;
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return clsx(values);
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function defaultDateRange(days = 30): DateRangeValue {
  const to = new Date();
  const from = subDays(to, days - 1);

  return {
    from: format(from, 'yyyy-MM-dd'),
    to: format(to, 'yyyy-MM-dd'),
  };
}

export function previousDateRange(range: DateRangeValue): DateRangeValue {
  const to = parseISO(`${range.from}T00:00:00.000Z`);
  const from = subDays(to, daySpan(range) + 1);

  return {
    from: format(from, 'yyyy-MM-dd'),
    to: format(subDays(to, 1), 'yyyy-MM-dd'),
  };
}

export function daySpan(range: DateRangeValue): number {
  const from = parseISO(`${range.from}T00:00:00.000Z`);
  const to = parseISO(`${range.to}T00:00:00.000Z`);

  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(getPreferredLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parseISO(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(getPreferredLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parseISO(value));
}

export function formatCompactDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(getPreferredLocale(), {
    day: 'numeric',
    month: 'short',
  }).format(parseISO(value));
}

export function formatCurrency(value: number, currency: string | null | undefined): string {
  const normalizedCurrency = currency ?? 'USD';

  try {
    return new Intl.NumberFormat(getPreferredLocale(), {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${normalizedCurrency} ${value.toLocaleString(getPreferredLocale())}`;
  }
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getPreferredLocale()).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${new Intl.NumberFormat(getPreferredLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value * 100)}%`;
}

export function toSentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function apiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
  return trimTrailingSlash(raw);
}
