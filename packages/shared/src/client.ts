import { z } from 'zod';

import {
  accountCreateInputSchema,
  accountListResponseSchema,
  accountSchema,
  accountUpdateInputSchema,
  analyticsByCategoryQuerySchema,
  analyticsByCategoryResponseSchema,
  analyticsSummaryQuerySchema,
  analyticsSummaryResponseSchema,
  analyticsTrendQuerySchema,
  analyticsTrendResponseSchema,
  aiAdviceQuerySchema,
  aiAdviceResponseSchema,
  aiInsightsQuerySchema,
  aiInsightsResponseSchema,
  aiReceiptParseInputSchema,
  aiReceiptParseResponseSchema,
  advisorInsightSchema,
  advisorInsightsQuerySchema,
  advisorActionBudgetInputSchema,
  advisorActionBudgetResponseSchema,
  advisorActionRecurringInputSchema,
  advisorActionRecurringResponseSchema,
  advisorActionTransferInputSchema,
  advisorActionTransferResponseSchema,
  apiErrorSchema,
  authResponseSchema,
  budgetCreateInputSchema,
  budgetListQuerySchema,
  budgetListResponseSchema,
  budgetSchema,
  budgetUpdateInputSchema,
  categoryCreateInputSchema,
  categoryListResponseSchema,
  categorySchema,
  upcomingPaymentCreateInputSchema,
  upcomingPaymentListQuerySchema,
  upcomingPaymentListResponseSchema,
  upcomingPaymentMarkPaidInputSchema,
  upcomingPaymentMarkPaidResponseSchema,
  upcomingPaymentSchema,
  upcomingPaymentUpdateInputSchema,
  dashboardRecentResponseSchema,
  exportTransactionsCsvResponseSchema,
  exportTransactionsQuerySchema,
  groupCreateInputSchema,
  groupExpenseCreateInputSchema,
  groupExpenseListResponseSchema,
  groupExpenseSchema,
  groupListResponseSchema,
  groupSchema,
  groupSettleResponseSchema,
  healthResponseSchema,
  logoutResponseSchema,
  meChangePasswordInputSchema,
  meUpdateInputSchema,
  mePreferencesResponseSchema,
  mePreferencesUpdateInputSchema,
  meResponseSchema,
  oauthInputSchema,
  recurringCreateInputSchema,
  recurringListQuerySchema,
  recurringListResponseSchema,
  recurringRuleSchema,
  recurringRunDueResponseSchema,
  recurringUpdateInputSchema,
  transferCreateInputSchema,
  transferCreateResponseSchema,
  transactionCreateInputSchema,
  transactionListQuerySchema,
  transactionListResponseSchema,
  transactionSchema,
  transactionUpdateInputSchema,
  weeklyReportQuerySchema,
  weeklyReportResponseSchema,
  type Account,
  type AccountCreateInput,
  type AccountListResponse,
  type AccountUpdateInput,
  type AnalyticsByCategoryQuery,
  type AnalyticsByCategoryResponse,
  type AnalyticsSummaryQuery,
  type AnalyticsSummaryResponse,
  type AnalyticsTrendQuery,
  type AnalyticsTrendResponse,
  type AiAdviceQuery,
  type AiAdviceResponse,
  type AiInsightsQuery,
  type AiInsightsResponse,
  type AiReceiptParseInput,
  type AiReceiptParseResponse,
  type AdvisorInsight,
  type AdvisorInsightsQuery,
  type AdvisorActionBudgetInput,
  type AdvisorActionBudgetResponse,
  type AdvisorActionRecurringInput,
  type AdvisorActionRecurringResponse,
  type AdvisorActionTransferInput,
  type AdvisorActionTransferResponse,
  type AuthResponse,
  type Budget,
  type BudgetCreateInput,
  type BudgetListQuery,
  type BudgetListResponse,
  type BudgetUpdateInput,
  type Category,
  type CategoryCreateInput,
  type CategoryListResponse,
  type UpcomingPayment,
  type UpcomingPaymentCreateInput,
  type UpcomingPaymentListQuery,
  type UpcomingPaymentListResponse,
  type UpcomingPaymentMarkPaidInput,
  type UpcomingPaymentMarkPaidResponse,
  type UpcomingPaymentUpdateInput,
  type DashboardRecentResponse,
  type ExportTransactionsCsvResponse,
  type ExportTransactionsQuery,
  type Group,
  type GroupCreateInput,
  type GroupExpense,
  type GroupExpenseCreateInput,
  type GroupExpenseListResponse,
  type GroupListResponse,
  type GroupSettleResponse,
  type HealthResponse,
  type LoginInput,
  type OauthInput,
  type LogoutInput,
  type MeChangePasswordInput,
  type MeResponse,
  type MeUpdateInput,
  type MePreferencesResponse,
  type MePreferencesUpdateInput,
  type RecurringCreateInput,
  type RecurringListQuery,
  type RecurringListResponse,
  type RecurringRule,
  type RecurringRunDueResponse,
  type RecurringUpdateInput,
  type RefreshInput,
  type RegisterInput,
  type TransferCreateInput,
  type TransferCreateResponse,
  type Transaction,
  type TransactionCreateInput,
  type TransactionListQuery,
  type TransactionListResponse,
  type TransactionUpdateInput,
  type WeeklyReportQuery,
  type WeeklyReportResponse,
} from './schemas';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface NormalizedApiError {
  code: string;
  message: string;
  details?: unknown;
  status?: number;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  query?: Record<string, unknown>;
}

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly details?: unknown;
  public readonly status: number;

  constructor(params: { code: string; message: string; status: number; details?: unknown }) {
    super(params.message);
    this.code = params.code;
    this.details = params.details;
    this.status = params.status;
    this.name = 'ApiClientError';
  }
}

type ProcessLike = {
  env?: Record<string, string | undefined>;
};

function readEnv(): Record<string, string | undefined> {
  const processLike = (globalThis as { process?: ProcessLike }).process;
  return processLike?.env ?? {};
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveBaseUrl(baseUrl?: string): string {
  if (baseUrl && baseUrl.trim()) {
    return trimTrailingSlash(baseUrl.trim());
  }

  const env = readEnv();
  const resolved = env.EXPO_PUBLIC_API_BASE_URL ?? env.API_BASE_URL ?? 'http://localhost:4000';
  return trimTrailingSlash(resolved);
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

function parseApiError(response: Response, payload: unknown): ApiClientError {
  const parsed = apiErrorSchema.safeParse(payload);

  if (parsed.success) {
    return new ApiClientError({
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      details: parsed.data.error.details,
      status: response.status,
    });
  }

  return new ApiClientError({
    code: 'API_REQUEST_FAILED',
    message: `Request failed with status ${response.status}`,
    details: payload,
    status: response.status,
  });
}

function buildPathWithQuery(path: string, query?: Record<string, unknown>): string {
  if (!query) {
    return path;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        searchParams.append(key, String(entry));
      }
      continue;
    }

    searchParams.append(key, String(value));
  }

  const queryString = searchParams.toString();
  if (!queryString) {
    return path;
  }

  return `${path}?${queryString}`;
}

export function normalizeApiError(error: unknown): NormalizedApiError {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'Unexpected error',
  };
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request('/health', healthResponseSchema);
  }

  async register(input: RegisterInput): Promise<AuthResponse> {
    return this.request('/auth/register', authResponseSchema, {
      method: 'POST',
      body: input,
    });
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    return this.request('/auth/login', authResponseSchema, {
      method: 'POST',
      body: input,
    });
  }

  async oauth(input: OauthInput): Promise<AuthResponse> {
    return this.request('/auth/oauth', authResponseSchema, {
      method: 'POST',
      body: oauthInputSchema.parse(input),
    });
  }

  async refresh(input: RefreshInput): Promise<AuthResponse> {
    return this.request('/auth/refresh', authResponseSchema, {
      method: 'POST',
      body: input,
    });
  }

  async logout(input: LogoutInput): Promise<void> {
    await this.request('/auth/logout', logoutResponseSchema, {
      method: 'POST',
      body: input,
    });
  }

  async logoutAll(accessToken: string): Promise<void> {
    await this.request('/auth/logout-all', logoutResponseSchema, {
      method: 'POST',
      accessToken,
    });
  }

  async getMe(accessToken: string): Promise<MeResponse> {
    return this.request('/me', meResponseSchema, {
      method: 'GET',
      accessToken,
    });
  }

  async updateMe(input: MeUpdateInput, accessToken: string): Promise<MeResponse> {
    return this.request('/me', meResponseSchema, {
      method: 'PATCH',
      accessToken,
      body: meUpdateInputSchema.parse(input),
    });
  }

  async changeMePassword(input: MeChangePasswordInput, accessToken: string): Promise<void> {
    await this.request('/me/password', logoutResponseSchema, {
      method: 'POST',
      accessToken,
      body: meChangePasswordInputSchema.parse(input),
    });
  }

  async getMePreferences(accessToken: string): Promise<MePreferencesResponse> {
    return this.request('/me/preferences', mePreferencesResponseSchema, {
      method: 'GET',
      accessToken,
    });
  }

  async updateMePreferences(
    input: MePreferencesUpdateInput,
    accessToken: string,
  ): Promise<MePreferencesResponse> {
    return this.request('/me/preferences', mePreferencesResponseSchema, {
      method: 'PATCH',
      accessToken,
      body: mePreferencesUpdateInputSchema.parse(input),
    });
  }

  async getAccounts(accessToken: string): Promise<AccountListResponse> {
    return this.request('/accounts', accountListResponseSchema, {
      method: 'GET',
      accessToken,
    });
  }

  async createAccount(input: AccountCreateInput, accessToken: string): Promise<Account> {
    return this.request('/accounts', accountSchema, {
      method: 'POST',
      accessToken,
      body: accountCreateInputSchema.parse(input),
    });
  }

  async updateAccount(id: string, input: AccountUpdateInput, accessToken: string): Promise<Account> {
    return this.request(`/accounts/${encodeURIComponent(id)}`, accountSchema, {
      method: 'PATCH',
      accessToken,
      body: accountUpdateInputSchema.parse(input),
    });
  }

  async deleteAccount(id: string, accessToken: string): Promise<void> {
    await this.request(`/accounts/${encodeURIComponent(id)}`, logoutResponseSchema, {
      method: 'DELETE',
      accessToken,
    });
  }

  async getCategories(accessToken: string): Promise<CategoryListResponse> {
    return this.request('/categories', categoryListResponseSchema, {
      method: 'GET',
      accessToken,
    });
  }

  async createCategory(input: CategoryCreateInput, accessToken: string): Promise<Category> {
    return this.request('/categories', categorySchema, {
      method: 'POST',
      accessToken,
      body: categoryCreateInputSchema.parse(input),
    });
  }

  async listTransactions(
    query: Partial<TransactionListQuery> = {},
    accessToken: string,
  ): Promise<TransactionListResponse> {
    return this.request('/transactions', transactionListResponseSchema, {
      method: 'GET',
      accessToken,
      query: transactionListQuerySchema.parse(query),
    });
  }

  async createTransfer(input: TransferCreateInput, accessToken: string): Promise<TransferCreateResponse> {
    return this.request('/transfers', transferCreateResponseSchema, {
      method: 'POST',
      accessToken,
      body: transferCreateInputSchema.parse(input),
    });
  }

  async deleteTransfer(transferGroupId: string, accessToken: string): Promise<void> {
    await this.request(`/transfers/${encodeURIComponent(transferGroupId)}`, logoutResponseSchema, {
      method: 'DELETE',
      accessToken,
    });
  }

  async createTransaction(input: TransactionCreateInput, accessToken: string): Promise<Transaction> {
    return this.request('/transactions', transactionSchema, {
      method: 'POST',
      accessToken,
      body: transactionCreateInputSchema.parse(input),
    });
  }

  async getTransaction(id: string, accessToken: string): Promise<Transaction> {
    return this.request(`/transactions/${encodeURIComponent(id)}`, transactionSchema, {
      method: 'GET',
      accessToken,
    });
  }

  async updateTransaction(
    id: string,
    input: TransactionUpdateInput,
    accessToken: string,
  ): Promise<Transaction> {
    return this.request(`/transactions/${encodeURIComponent(id)}`, transactionSchema, {
      method: 'PATCH',
      accessToken,
      body: transactionUpdateInputSchema.parse(input),
    });
  }

  async deleteTransaction(id: string, accessToken: string): Promise<void> {
    await this.request(`/transactions/${encodeURIComponent(id)}`, logoutResponseSchema, {
      method: 'DELETE',
      accessToken,
    });
  }

  async getDashboardRecent(accessToken: string): Promise<DashboardRecentResponse> {
    return this.request('/dashboard/recent', dashboardRecentResponseSchema, {
      method: 'GET',
      accessToken,
    });
  }

  async listUpcomingPayments(
    query: Partial<UpcomingPaymentListQuery> = {},
    accessToken: string,
  ): Promise<UpcomingPaymentListResponse> {
    return this.request('/upcoming-payments', upcomingPaymentListResponseSchema, {
      method: 'GET',
      accessToken,
      query: upcomingPaymentListQuerySchema.parse(query),
    });
  }

  async createUpcomingPayment(
    input: UpcomingPaymentCreateInput,
    accessToken: string,
  ): Promise<UpcomingPayment> {
    return this.request('/upcoming-payments', upcomingPaymentSchema, {
      method: 'POST',
      accessToken,
      body: upcomingPaymentCreateInputSchema.parse(input),
    });
  }

  async updateUpcomingPayment(
    id: string,
    input: UpcomingPaymentUpdateInput,
    accessToken: string,
  ): Promise<UpcomingPayment> {
    return this.request(`/upcoming-payments/${encodeURIComponent(id)}`, upcomingPaymentSchema, {
      method: 'PATCH',
      accessToken,
      body: upcomingPaymentUpdateInputSchema.parse(input),
    });
  }

  async markUpcomingPaymentPaid(
    id: string,
    input: UpcomingPaymentMarkPaidInput,
    accessToken: string,
  ): Promise<UpcomingPaymentMarkPaidResponse> {
    return this.request(
      `/upcoming-payments/${encodeURIComponent(id)}/mark-paid`,
      upcomingPaymentMarkPaidResponseSchema,
      {
        method: 'POST',
        accessToken,
        body: upcomingPaymentMarkPaidInputSchema.parse(input),
      },
    );
  }

  async getAnalyticsSummary(
    query: AnalyticsSummaryQuery,
    accessToken: string,
  ): Promise<AnalyticsSummaryResponse> {
    return this.request('/analytics/summary', analyticsSummaryResponseSchema, {
      method: 'GET',
      accessToken,
      query: analyticsSummaryQuerySchema.parse(query),
    });
  }

  async getAnalyticsByCategory(
    query: AnalyticsByCategoryQuery,
    accessToken: string,
  ): Promise<AnalyticsByCategoryResponse> {
    return this.request('/analytics/by-category', analyticsByCategoryResponseSchema, {
      method: 'GET',
      accessToken,
      query: analyticsByCategoryQuerySchema.parse(query),
    });
  }

  async getAnalyticsTrend(query: AnalyticsTrendQuery, accessToken: string): Promise<AnalyticsTrendResponse> {
    return this.request('/analytics/trend', analyticsTrendResponseSchema, {
      method: 'GET',
      accessToken,
      query: analyticsTrendQuerySchema.parse(query),
    });
  }

  async getAiAdvice(query: AiAdviceQuery, accessToken: string): Promise<AiAdviceResponse> {
    return this.request('/ai/advice', aiAdviceResponseSchema, {
      method: 'GET',
      accessToken,
      query: aiAdviceQuerySchema.parse(query),
    });
  }

  async getAiInsights(
    query: Partial<AiInsightsQuery> = {},
    accessToken: string,
  ): Promise<AiInsightsResponse> {
    return this.request('/ai/insights', aiInsightsResponseSchema, {
      method: 'GET',
      accessToken,
      query: aiInsightsQuerySchema.parse(query),
    });
  }

  async parseReceiptWithAi(
    input: AiReceiptParseInput,
    accessToken: string,
  ): Promise<AiReceiptParseResponse> {
    return this.request('/ai/receipt-parse', aiReceiptParseResponseSchema, {
      method: 'POST',
      accessToken,
      body: aiReceiptParseInputSchema.parse(input),
    });
  }

  async getAdvisorInsights(
    query: AdvisorInsightsQuery,
    accessToken: string,
  ): Promise<AdvisorInsight> {
    return this.request('/advisor/insights', advisorInsightSchema, {
      method: 'GET',
      accessToken,
      query: advisorInsightsQuerySchema.parse(query),
    });
  }

  async createAdvisorBudgets(
    input: AdvisorActionBudgetInput,
    accessToken: string,
  ): Promise<AdvisorActionBudgetResponse> {
    return this.request('/advisor/actions/budget', advisorActionBudgetResponseSchema, {
      method: 'POST',
      accessToken,
      body: advisorActionBudgetInputSchema.parse(input),
    });
  }

  async createAdvisorRecurring(
    input: AdvisorActionRecurringInput,
    accessToken: string,
  ): Promise<AdvisorActionRecurringResponse> {
    return this.request('/advisor/actions/recurring', advisorActionRecurringResponseSchema, {
      method: 'POST',
      accessToken,
      body: advisorActionRecurringInputSchema.parse(input),
    });
  }

  async createAdvisorTransfer(
    input: AdvisorActionTransferInput,
    accessToken: string,
  ): Promise<AdvisorActionTransferResponse> {
    return this.request('/advisor/actions/transfer', advisorActionTransferResponseSchema, {
      method: 'POST',
      accessToken,
      body: advisorActionTransferInputSchema.parse(input),
    });
  }

  async getWeeklyReport(
    query: Partial<WeeklyReportQuery> = {},
    accessToken: string,
  ): Promise<WeeklyReportResponse> {
    return this.request('/reports/weekly', weeklyReportResponseSchema, {
      method: 'GET',
      accessToken,
      query: weeklyReportQuerySchema.parse(query),
    });
  }

  async listBudgets(
    query: Partial<BudgetListQuery> = {},
    accessToken: string,
  ): Promise<BudgetListResponse> {
    return this.request('/budgets', budgetListResponseSchema, {
      method: 'GET',
      accessToken,
      query: budgetListQuerySchema.parse(query),
    });
  }

  async createBudget(input: BudgetCreateInput, accessToken: string): Promise<Budget> {
    return this.request('/budgets', budgetSchema, {
      method: 'POST',
      accessToken,
      body: budgetCreateInputSchema.parse(input),
    });
  }

  async updateBudget(id: string, input: BudgetUpdateInput, accessToken: string): Promise<Budget> {
    return this.request(`/budgets/${encodeURIComponent(id)}`, budgetSchema, {
      method: 'PATCH',
      accessToken,
      body: budgetUpdateInputSchema.parse(input),
    });
  }

  async deleteBudget(id: string, accessToken: string): Promise<void> {
    await this.request(`/budgets/${encodeURIComponent(id)}`, logoutResponseSchema, {
      method: 'DELETE',
      accessToken,
    });
  }

  async getGroups(accessToken: string): Promise<GroupListResponse> {
    return this.request('/groups', groupListResponseSchema, {
      method: 'GET',
      accessToken,
    });
  }

  async createGroup(input: GroupCreateInput, accessToken: string): Promise<Group> {
    return this.request('/groups', groupSchema, {
      method: 'POST',
      accessToken,
      body: groupCreateInputSchema.parse(input),
    });
  }

  async getGroup(id: string, accessToken: string): Promise<Group> {
    return this.request(`/groups/${encodeURIComponent(id)}`, groupSchema, {
      method: 'GET',
      accessToken,
    });
  }

  async getGroupExpenses(id: string, accessToken: string): Promise<GroupExpenseListResponse> {
    return this.request(`/groups/${encodeURIComponent(id)}/expenses`, groupExpenseListResponseSchema, {
      method: 'GET',
      accessToken,
    });
  }

  async createGroupExpense(
    id: string,
    input: GroupExpenseCreateInput,
    accessToken: string,
  ): Promise<GroupExpense> {
    return this.request(`/groups/${encodeURIComponent(id)}/expenses`, groupExpenseSchema, {
      method: 'POST',
      accessToken,
      body: groupExpenseCreateInputSchema.parse(input),
    });
  }

  async settleGroup(id: string, accessToken: string): Promise<GroupSettleResponse> {
    return this.request(`/groups/${encodeURIComponent(id)}/settle`, groupSettleResponseSchema, {
      method: 'POST',
      accessToken,
      body: {},
    });
  }

  async listRecurring(
    query: Partial<RecurringListQuery> = {},
    accessToken: string,
  ): Promise<RecurringListResponse> {
    return this.request('/recurring', recurringListResponseSchema, {
      method: 'GET',
      accessToken,
      query: recurringListQuerySchema.parse(query),
    });
  }

  async createRecurring(input: RecurringCreateInput, accessToken: string): Promise<RecurringRule> {
    return this.request('/recurring', recurringRuleSchema, {
      method: 'POST',
      accessToken,
      body: recurringCreateInputSchema.parse(input),
    });
  }

  async updateRecurring(
    id: string,
    input: RecurringUpdateInput,
    accessToken: string,
  ): Promise<RecurringRule> {
    return this.request(`/recurring/${encodeURIComponent(id)}`, recurringRuleSchema, {
      method: 'PATCH',
      accessToken,
      body: recurringUpdateInputSchema.parse(input),
    });
  }

  async deleteRecurring(id: string, accessToken: string): Promise<void> {
    await this.request(`/recurring/${encodeURIComponent(id)}`, logoutResponseSchema, {
      method: 'DELETE',
      accessToken,
    });
  }

  async runRecurringDue(cronSecret: string): Promise<RecurringRunDueResponse> {
    return this.request(
      '/recurring/run-due',
      recurringRunDueResponseSchema,
      {
        method: 'POST',
      },
      {
        'x-cron-secret': cronSecret,
      },
    );
  }

  async exportTransactionsCsv(
    query: Partial<ExportTransactionsQuery> = {},
    accessToken: string,
  ): Promise<ExportTransactionsCsvResponse> {
    return this.request('/export/transactions.csv', exportTransactionsCsvResponseSchema, {
      method: 'GET',
      accessToken,
      query: exportTransactionsQuerySchema.parse(query),
    });
  }

  private async request<T>(
    path: string,
    schema: z.ZodSchema<T>,
    options: RequestOptions = {},
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const method = options.method ?? 'GET';
    const resolvedPath = buildPathWithQuery(path, options.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }
    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${resolvedPath}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const payload = await readPayload(response);

    if (!response.ok) {
      throw parseApiError(response, payload);
    }

    const parsedPayload = schema.safeParse(payload);
    if (!parsedPayload.success) {
      throw new ApiClientError({
        code: 'INVALID_RESPONSE_PAYLOAD',
        message: 'Received invalid response payload from API',
        details: parsedPayload.error.flatten(),
        status: response.status,
      });
    }

    return parsedPayload.data;
  }
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  return new ApiClient(options);
}
