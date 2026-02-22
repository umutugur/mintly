import type { CategoryType } from '@mintly/shared';

export const financeQueryKeys = {
  dashboard: {
    recent: () => ['dashboard', 'recent'] as const,
  },
  accounts: {
    all: () => ['accounts'] as const,
    list: () => ['accounts', 'list'] as const,
  },
  categories: {
    all: () => ['categories'] as const,
    list: () => ['categories', 'list'] as const,
  },
  transactions: {
    all: () => ['transactions'] as const,
    list: (filters: Record<string, unknown>) => ['transactions', 'list', filters] as const,
  },
  recurring: {
    all: () => ['recurring'] as const,
    list: (filters: Record<string, unknown>) => ['recurring', 'list', filters] as const,
  },
  analytics: {
    all: () => ['analytics'] as const,
    month: (month: string) => ['analytics', month] as const,
    summary: (month: string) => ['analytics', month, 'summary'] as const,
    byCategory: (month: string, type: CategoryType) =>
      ['analytics', month, 'by-category', type] as const,
    trend: (month: string, from: string, to: string) =>
      ['analytics', month, 'trend', { from, to }] as const,
  },
  ai: {
    all: () => ['ai'] as const,
    advice: (month: string) => ['ai', 'advice', month] as const,
    insights: (from: string, to: string, language: string) =>
      ['ai', 'insights', { from, to, language }] as const,
    advisorInsights: (month: string, language: string) =>
      ['ai', 'advisor-insights', { month, language }] as const,
  },
  reports: {
    all: () => ['reports'] as const,
    weekly: (weekStart?: string) => ['reports', 'weekly', weekStart ?? 'current'] as const,
  },
  groups: {
    all: () => ['groups'] as const,
    list: () => ['groups', 'list'] as const,
    detail: (groupId: string) => ['groups', 'detail', groupId] as const,
    expenses: (groupId: string) => ['groups', 'expenses', groupId] as const,
  },
  budgets: {
    all: () => ['budgets'] as const,
    month: (month: string) => ['budgets', month] as const,
    list: (month: string) => ['budgets', month, 'list'] as const,
  },
  upcomingPayments: {
    all: () => ['upcoming-payments'] as const,
    list: (filters: Record<string, unknown>) => ['upcoming-payments', 'list', filters] as const,
    detail: (paymentId: string) => ['upcoming-payments', 'detail', paymentId] as const,
  },
};
