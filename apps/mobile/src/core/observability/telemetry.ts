import { addSentryBreadcrumb } from './sentry';

export function trackAppEvent(
  message: string,
  params?: {
    category?: string;
    level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
    data?: Record<string, unknown>;
  },
): void {
  addSentryBreadcrumb({
    category: params?.category ?? 'app',
    message,
    level: params?.level,
    data: params?.data,
  });
}
