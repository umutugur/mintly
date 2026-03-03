import { z, type ZodType } from 'zod';

import {
  adminSendNotificationResponseSchema,
  adminSessionSchema,
  apiErrorSchema,
  categoryAnalyticsSchema,
  loginResponseSchema,
  notificationTokensSchema,
  overviewSchema,
  retentionSchema,
  timeseriesSchema,
  transactionsListSchema,
  userDetailSchema,
  usersListSchema,
  type AdminSession,
  type AdminSendNotificationResponse,
  type CategoryAnalyticsResponse,
  type NotificationTokensResponse,
  type OverviewResponse,
  type RetentionResponse,
  type TimeseriesResponse,
  type TransactionsListResponse,
  type UserDetailResponse,
  type UsersListResponse,
} from './schemas';
import { apiBaseUrl } from './utils';

const TOKEN_STORAGE_KEY = 'montly_admin_access_token';

let accessTokenMemory: string | null = null;

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(params: { code: string; message: string; status: number; details?: unknown }) {
    super(params.message);
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
    this.name = 'ApiClientError';
  }
}

function readStoredToken(): string | null {
  if (accessTokenMemory) {
    return accessTokenMemory;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const restored = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  accessTokenMemory = restored;
  return restored;
}

export function setStoredToken(token: string): void {
  accessTokenMemory = token;

  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}

export function clearStoredToken(): void {
  accessTokenMemory = null;

  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function getStoredToken(): string | null {
  return readStoredToken();
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toApiError(response: Response, payload: unknown): ApiClientError {
  const parsed = apiErrorSchema.safeParse(payload);

  if (parsed.success) {
    return new ApiClientError({
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      status: response.status,
      details: parsed.data.error.details,
    });
  }

  return new ApiClientError({
    code: 'API_REQUEST_FAILED',
    message: `Request failed with status ${response.status}`,
    status: response.status,
    details: payload,
  });
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(`${apiBaseUrl()}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function request<T>(params: {
  path: string;
  schema: ZodType<T>;
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Record<string, unknown>;
  tokenOverride?: string | null;
}): Promise<T> {
  const token = params.tokenOverride ?? readStoredToken();
  const response = await fetch(buildUrl(params.path, params.query), {
    method: params.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    throw toApiError(response, payload);
  }

  return params.schema.parse(payload);
}

export async function login(input: { email: string; password: string }): Promise<void> {
  const auth = await request({
    path: '/auth/login',
    schema: loginResponseSchema,
    method: 'POST',
    body: input,
    tokenOverride: null,
  });

  setStoredToken(auth.accessToken);

  try {
    const session = await getAdminSession(auth.accessToken);

    if (!session.admin) {
      throw new ApiClientError({
        code: 'ADMIN_REQUIRED',
        message: 'This account is not allowed to access the admin panel.',
        status: 403,
      });
    }
  } catch (error) {
    clearStoredToken();
    throw error;
  }
}

export function getAdminSession(tokenOverride?: string): Promise<AdminSession> {
  return request({
    path: '/admin/session',
    schema: adminSessionSchema,
    tokenOverride: tokenOverride ?? undefined,
  });
}

export function getOverview(): Promise<OverviewResponse> {
  return request({
    path: '/admin/overview',
    schema: overviewSchema,
  });
}

export function getTransactionsTimeseries(input: {
  from: string;
  to: string;
  tz?: string;
  granularity?: 'day' | 'week' | 'month';
  currency?: string;
}): Promise<TimeseriesResponse> {
  return request({
    path: '/admin/analytics/transactions-timeseries',
    schema: timeseriesSchema,
    query: input,
  });
}

export function getCategoryAnalytics(input: {
  from: string;
  to: string;
  type?: 'income' | 'expense';
  currency?: string;
  limit?: number;
}): Promise<CategoryAnalyticsResponse> {
  return request({
    path: '/admin/analytics/categories',
    schema: categoryAnalyticsSchema,
    query: input,
  });
}

export function getUsers(input: {
  search?: string;
  from?: string;
  to?: string;
  status?: 'active' | 'inactive';
  provider?: 'google' | 'apple' | 'none';
  page?: number;
  limit?: number;
}): Promise<UsersListResponse> {
  return request({
    path: '/admin/users',
    schema: usersListSchema,
    query: input,
  });
}

export function getUserDetail(id: string): Promise<UserDetailResponse> {
  return request({
    path: `/admin/users/${id}`,
    schema: userDetailSchema,
  });
}

export function getTransactions(input: {
  search?: string;
  type?: 'income' | 'expense';
  kind?: 'normal' | 'transfer';
  currency?: string;
  userId?: string;
  accountId?: string;
  categoryKey?: string;
  from?: string;
  to?: string;
  deleted?: boolean;
  page?: number;
  limit?: number;
}): Promise<TransactionsListResponse> {
  return request({
    path: '/admin/transactions',
    schema: transactionsListSchema,
    query: input,
  });
}

export function getRetention(input: {
  cohort?: 'weekly' | 'monthly';
  from?: string;
  to?: string;
}): Promise<RetentionResponse> {
  return request({
    path: '/admin/analytics/users-retention',
    schema: retentionSchema,
    query: input,
  });
}

export function getNotificationTokens(input: {
  platform?: 'ios' | 'android';
  hasToken?: boolean;
  page?: number;
  limit?: number;
}): Promise<NotificationTokensResponse> {
  return request({
    path: '/admin/notifications/tokens',
    schema: notificationTokensSchema,
    query: input,
  });
}

export function adminSendNotification(input: {
  title: string;
  body: string;
  target: 'all' | 'hasToken' | 'users';
  userIds?: string[];
}): Promise<AdminSendNotificationResponse> {
  return request({
    path: '/admin/notifications/send',
    schema: adminSendNotificationResponseSchema,
    method: 'POST',
    body: input,
  });
}

export function asApiError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: 'The admin API returned an unexpected response shape.',
      status: 500,
      details: error.flatten(),
    });
  }

  if (error instanceof Error) {
    return new ApiClientError({
      code: 'UNKNOWN_ERROR',
      message: error.message,
      status: 500,
    });
  }

  return new ApiClientError({
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred.',
    status: 500,
    details: error,
  });
}
