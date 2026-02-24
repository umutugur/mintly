import { z } from 'zod';

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code');
const monthStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM');
const dateTimeStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid datetime');
const dateOnlyStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD');

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  name: z.literal('Mintly API'),
});

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120).optional(),
});

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const oauthProviderSchema = z.enum(['google', 'apple']);

export const oauthInputSchema = z.object({
  provider: oauthProviderSchema,
  idToken: z.string().min(1),
  nonce: z.string().trim().min(8).max(256).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const refreshInputSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutInputSchema = z.object({
  refreshToken: z.string().min(1),
});

export const riskProfileSchema = z.enum(['low', 'medium', 'high']);

export const authUserSchema = z.object({
  id: z.string().min(1),
  email: emailSchema,
  name: z.string().nullable(),
});

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  user: authUserSchema,
});

export const meResponseSchema = z.object({
  user: authUserSchema.extend({
    baseCurrency: currencySchema.nullable(),
    savingsTargetRate: z.number().int().min(0).max(80),
    riskProfile: riskProfileSchema,
  }),
});

export const meUpdateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const mePreferencesSchema = z.object({
  savingsTargetRate: z.number().int().min(0).max(80),
  riskProfile: riskProfileSchema,
});

export const mePreferencesResponseSchema = z.object({
  preferences: mePreferencesSchema,
});

export const mePreferencesUpdateInputSchema = z
  .object({
    savingsTargetRate: z.number().int().min(0).max(80).optional(),
    riskProfile: riskProfileSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const logoutResponseSchema = z.object({
  ok: z.literal(true),
});

export const accountTypeSchema = z.enum(['cash', 'bank', 'credit']);
export const categoryTypeSchema = z.enum(['income', 'expense']);
export const transactionTypeSchema = z.enum(['income', 'expense']);
export const transactionKindSchema = z.enum(['normal', 'transfer']);
export const transferDirectionSchema = z.enum(['out', 'in']);
export const recurringCadenceSchema = z.enum(['weekly', 'monthly']);
export const recurringKindSchema = z.enum(['normal', 'transfer']);

export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  type: accountTypeSchema,
  currency: currencySchema,
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const accountListResponseSchema = z.object({
  accounts: z.array(accountSchema),
});

export const accountCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: accountTypeSchema,
  currency: currencySchema,
});

export const accountUpdateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    type: accountTypeSchema.optional(),
    currency: currencySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  type: categoryTypeSchema,
  color: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Invalid color hex'),
  icon: z.string().min(1).max(64).nullable(),
  isSystem: z.boolean(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const categoryListResponseSchema = z.object({
  categories: z.array(categorySchema),
});

export const categoryCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: categoryTypeSchema,
  color: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Invalid color hex'),
  icon: z.string().trim().min(1).max(64).optional(),
});

export const transactionSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  categoryId: z.string().min(1).nullable(),
  type: transactionTypeSchema,
  kind: transactionKindSchema,
  transferGroupId: z.string().min(1).nullable(),
  transferDirection: transferDirectionSchema.nullable(),
  relatedAccountId: z.string().min(1).nullable(),
  amount: z.number().positive(),
  currency: currencySchema,
  description: z.string().max(500).nullable(),
  occurredAt: dateTimeStringSchema,
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
  deletedAt: dateTimeStringSchema.nullable().optional(),
});

export const transactionCreateInputSchema = z.object({
  accountId: z.string().trim().min(1),
  categoryId: z.string().trim().min(1),
  type: transactionTypeSchema,
  amount: z.number().positive(),
  currency: currencySchema,
  description: z.string().trim().max(500).optional(),
  occurredAt: dateTimeStringSchema,
});

export const transactionUpdateInputSchema = z
  .object({
    accountId: z.string().trim().min(1).optional(),
    categoryId: z.string().trim().min(1).optional(),
    type: transactionTypeSchema.optional(),
    amount: z.number().positive().optional(),
    currency: currencySchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    occurredAt: dateTimeStringSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const transactionListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    accountId: z.string().trim().min(1).optional(),
    categoryId: z.string().trim().min(1).optional(),
    type: transactionTypeSchema.optional(),
    kind: transactionKindSchema.optional(),
    currency: currencySchema.optional(),
    from: dateTimeStringSchema.optional(),
    to: dateTimeStringSchema.optional(),
    search: z.string().trim().min(1).max(120).optional(),
    includeDeleted: z.coerce.boolean().default(false),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) {
        return true;
      }

      return new Date(value.from).getTime() <= new Date(value.to).getTime();
    },
    {
      message: '`from` must be less than or equal to `to`',
      path: ['from'],
    },
  );

export const transactionListResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }),
});

export const accountBalanceSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).max(120),
  type: accountTypeSchema,
  currency: currencySchema,
  balance: z.number(),
});

export const upcomingPaymentTypeSchema = z.enum([
  'bill',
  'rent',
  'subscription',
  'debt',
  'other',
]);

export const upcomingPaymentStatusSchema = z.enum(['upcoming', 'paid', 'skipped']);
export const upcomingPaymentSourceSchema = z.enum(['ocr', 'template', 'manual']);

export const upcomingPaymentMetaSchema = z.object({
  vendor: z.string().trim().min(1).max(160).optional(),
  invoiceNo: z.string().trim().min(1).max(120).optional(),
  rawText: z.string().trim().min(1).max(6000).optional(),
  detectedCurrency: currencySchema.optional(),
});

export const upcomingPaymentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  type: upcomingPaymentTypeSchema,
  amount: z.number().positive(),
  currency: currencySchema,
  dueDate: dateTimeStringSchema,
  status: upcomingPaymentStatusSchema,
  source: upcomingPaymentSourceSchema,
  linkedTransactionId: z.string().min(1).nullable(),
  recurringTemplateId: z.string().min(1).nullable(),
  meta: upcomingPaymentMetaSchema.nullable(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const upcomingPaymentListQuerySchema = z
  .object({
    from: dateOnlyStringSchema.optional(),
    to: dateOnlyStringSchema.optional(),
    status: upcomingPaymentStatusSchema.default('upcoming'),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) {
        return true;
      }
      return value.from <= value.to;
    },
    {
      message: '`from` must be less than or equal to `to`',
      path: ['from'],
    },
  );

export const upcomingPaymentListResponseSchema = z.object({
  upcomingPayments: z.array(upcomingPaymentSchema),
});

export const upcomingPaymentCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  type: upcomingPaymentTypeSchema,
  amount: z.number().positive(),
  currency: currencySchema,
  dueDate: dateTimeStringSchema,
  source: upcomingPaymentSourceSchema.default('manual'),
  meta: upcomingPaymentMetaSchema.optional(),
});

export const upcomingPaymentUpdateInputSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    type: upcomingPaymentTypeSchema.optional(),
    amount: z.number().positive().optional(),
    dueDate: dateTimeStringSchema.optional(),
    status: upcomingPaymentStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const upcomingPaymentMarkPaidInputSchema = z.object({
  accountId: z.string().trim().min(1).optional(),
  occurredAt: dateTimeStringSchema.optional(),
});

export const upcomingPaymentMarkPaidResponseSchema = z.object({
  upcomingPayment: upcomingPaymentSchema,
  transaction: transactionSchema.nullable(),
});

export const dashboardRecentResponseSchema = z.object({
  recentTransactions: z.array(transactionSchema),
  totalBalance: z.number(),
  balances: z.array(accountBalanceSchema),
  upcomingPaymentsDueSoon: z.array(upcomingPaymentSchema),
});

export const transferCreateInputSchema = z
  .object({
    fromAccountId: z.string().trim().min(1),
    toAccountId: z.string().trim().min(1),
    amount: z.number().positive(),
    occurredAt: dateTimeStringSchema,
    description: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: '`fromAccountId` and `toAccountId` must differ',
    path: ['toAccountId'],
  });

export const transferCreateResponseSchema = z.object({
  groupId: z.string().min(1),
  fromTransactionId: z.string().min(1),
  toTransactionId: z.string().min(1),
});

export const analyticsSummaryQuerySchema = z.object({
  month: monthStringSchema,
});

export const analyticsTopCategorySchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(120),
  type: categoryTypeSchema,
  total: z.number().min(0),
  percent: z.number().min(0),
});

export const analyticsSummaryResponseSchema = z.object({
  month: monthStringSchema,
  currency: currencySchema.nullable(),
  incomeTotal: z.number().min(0),
  expenseTotal: z.number().min(0),
  netTotal: z.number(),
  transactionCount: z.number().int().min(0),
  topCategories: z.array(analyticsTopCategorySchema),
});

export const analyticsByCategoryQuerySchema = z.object({
  month: monthStringSchema,
  type: categoryTypeSchema,
});

export const analyticsByCategoryItemSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(120),
  total: z.number().min(0),
  count: z.number().int().min(0),
});

export const analyticsByCategoryResponseSchema = z.object({
  month: monthStringSchema,
  type: categoryTypeSchema,
  currency: currencySchema.nullable(),
  categories: z.array(analyticsByCategoryItemSchema),
});

export const analyticsTrendQuerySchema = z
  .object({
    from: monthStringSchema,
    to: monthStringSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: '`from` must be less than or equal to `to`',
    path: ['from'],
  });

export const analyticsTrendPointSchema = z.object({
  month: monthStringSchema,
  incomeTotal: z.number().min(0),
  expenseTotal: z.number().min(0),
  netTotal: z.number(),
});

export const analyticsTrendResponseSchema = z.object({
  currency: currencySchema.nullable(),
  points: z.array(analyticsTrendPointSchema),
});

export const aiAdviceSeveritySchema = z.enum(['info', 'warning', 'success']);

export const aiAdviceQuerySchema = z.object({
  month: monthStringSchema,
});

export const aiAdviceItemSchema = z.object({
  title: z.string().min(1).max(140),
  message: z.string().min(1).max(500),
  severity: aiAdviceSeveritySchema,
});

export const aiAdviceBudgetOverrunSchema = z.object({
  budgetId: z.string().min(1),
  categoryId: z.string().min(1),
  categoryName: z.string().min(1).max(120),
  limitAmount: z.number().min(0),
  spentAmount: z.number().min(0),
  overAmount: z.number().min(0),
});

export const aiAdviceResponseSchema = z.object({
  month: monthStringSchema,
  currency: currencySchema.nullable(),
  totalIncome: z.number().min(0),
  totalExpense: z.number().min(0),
  net: z.number(),
  topExpenseCategory: z
    .object({
      categoryId: z.string().min(1),
      name: z.string().min(1).max(120),
      total: z.number().min(0),
    })
    .nullable(),
  budgetOverruns: z.array(aiAdviceBudgetOverrunSchema),
  advice: z.array(aiAdviceItemSchema),
  nextActions: z.array(z.string().min(1).max(280)),
});

export const weeklyReportQuerySchema = z.object({
  weekStart: dateOnlyStringSchema.optional(),
});

export const weeklyReportResponseSchema = z.object({
  weekStart: dateOnlyStringSchema,
  weekEnd: dateOnlyStringSchema,
  currency: currencySchema.nullable(),
  healthScore: z.number().int().min(0).max(100),
  summaryText: z.string().min(1).max(500),
  highlights: z.array(z.string().min(1).max(280)),
  riskFlags: z.array(z.string().min(1).max(280)),
  nextWeekForecastText: z.string().min(1).max(500),
});

export const aiInsightsLanguageSchema = z.enum(['tr', 'en', 'ru']);

export const aiInsightsQuerySchema = z
  .object({
    from: dateOnlyStringSchema.optional(),
    to: dateOnlyStringSchema.optional(),
    language: aiInsightsLanguageSchema.default('tr'),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) {
        return true;
      }

      return value.from <= value.to;
    },
    {
      message: '`from` must be less than or equal to `to`',
      path: ['from'],
    },
  );

export const aiInsightsResponseSchema = z.object({
  from: dateOnlyStringSchema,
  to: dateOnlyStringSchema,
  language: aiInsightsLanguageSchema,
  currency: currencySchema.nullable(),
  summary: z.string().min(1).max(1500),
  topFindings: z.array(z.string().min(1).max(320)).min(1).max(8),
  suggestedActions: z.array(z.string().min(1).max(320)).min(1).max(8),
  warnings: z.array(z.string().min(1).max(320)).max(8),
});

export const advisorInsightsQuerySchema = z.object({
  month: monthStringSchema,
  language: aiInsightsLanguageSchema.default('tr'),
  regenerate: z.coerce.boolean().default(false),
});

export const advisorInsightModeSchema = z.enum(['ai', 'fallback']);
export const advisorInsightProviderSchema = z.enum(['cloudflare']);

export const advisorCashflowPointSchema = z.object({
  month: monthStringSchema,
  incomeTotal: z.number().min(0),
  expenseTotal: z.number().min(0),
  netTotal: z.number(),
});

export const advisorCategoryBreakdownItemSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(120),
  total: z.number().min(0),
  sharePercent: z.number().min(0),
});

export const advisorBudgetStatusSchema = z.enum(['on_track', 'near_limit', 'over_limit']);

export const advisorBudgetItemSchema = z.object({
  budgetId: z.string().min(1),
  categoryId: z.string().min(1),
  categoryName: z.string().min(1).max(120),
  limitAmount: z.number().min(0),
  spentAmount: z.number().min(0),
  remainingAmount: z.number(),
  percentUsed: z.number().min(0),
  status: advisorBudgetStatusSchema,
});

export const advisorRecurringRuleItemSchema = z.object({
  ruleId: z.string().min(1),
  label: z.string().min(1).max(120),
  cadence: recurringCadenceSchema,
  amount: z.number().min(0),
  nextRunAt: dateTimeStringSchema.nullable(),
});

export const advisorRecurringMerchantItemSchema = z.object({
  label: z.string().min(1).max(120),
  total: z.number().min(0),
  count: z.number().int().min(1),
});

export const advisorFlagsSchema = z.object({
  overspendingCategoryNames: z.array(z.string().min(1).max(120)).max(12),
  negativeCashflow: z.boolean(),
  lowSavingsRate: z.boolean(),
  irregularIncome: z.boolean(),
});

export const advisorOverviewSchema = z.object({
  last30DaysIncome: z.number().min(0),
  last30DaysExpense: z.number().min(0),
  last30DaysNet: z.number(),
  currentMonthIncome: z.number().min(0),
  currentMonthExpense: z.number().min(0),
  currentMonthNet: z.number(),
  savingsRate: z.number(),
});

export const advisorSavingsAdviceSchema = z.object({
  targetRate: z.number().min(0).max(1),
  monthlyTargetAmount: z.number().min(0),
  next7DaysActions: z.array(z.string().min(1).max(320)).min(1).max(8),
  autoTransferSuggestion: z.string().min(1).max(320),
});

export const advisorRiskLevelSchema = z.enum(['low', 'medium', 'high']);
export const advisorEmergencyFundStatusSchema = z.enum(['not_started', 'building', 'ready']);

export const advisorRiskProfileSchema = z.object({
  level: advisorRiskLevelSchema,
  title: z.string().min(1).max(180),
  rationale: z.string().min(1).max(400),
  options: z.array(z.string().min(1).max(260)).min(1).max(6),
});

export const advisorInvestmentAdviceSchema = z.object({
  emergencyFundTarget: z.number().min(0),
  emergencyFundCurrent: z.number().min(0),
  emergencyFundStatus: advisorEmergencyFundStatusSchema,
  profiles: z.array(advisorRiskProfileSchema).min(1).max(3),
  guidance: z.array(z.string().min(1).max(320)).min(1).max(8),
});

export const advisorCutCandidateSchema = z.object({
  label: z.string().min(1).max(120),
  currentAmount: z.number().min(0),
  suggestedReductionPercent: z.number().min(0).max(100),
  alternativeAction: z.string().min(1).max(320),
});

export const advisorExpenseOptimizationSchema = z.object({
  cutCandidates: z.array(advisorCutCandidateSchema).min(1).max(6),
  quickWins: z.array(z.string().min(1).max(320)).min(1).max(8),
});

export const advisorAdviceSchema = z.object({
  summary: z.string().min(1).max(1500),
  savings: advisorSavingsAdviceSchema,
  investment: advisorInvestmentAdviceSchema,
  expenseOptimization: advisorExpenseOptimizationSchema,
  tips: z.array(z.string().min(1).max(320)).min(1).max(10),
});

export const advisorInsightSchema = z.object({
  month: monthStringSchema,
  generatedAt: dateTimeStringSchema,
  language: aiInsightsLanguageSchema,
  mode: advisorInsightModeSchema,
  modeReason: z.string().min(1).max(80).nullable(),
  provider: advisorInsightProviderSchema.nullable(),
  providerStatus: z.number().int().min(100).max(599).nullable(),
  currency: currencySchema.nullable(),
  preferences: mePreferencesSchema,
  overview: advisorOverviewSchema,
  categoryBreakdown: z.array(advisorCategoryBreakdownItemSchema).max(5),
  cashflowTrend: z.array(advisorCashflowPointSchema).length(3),
  budgetAdherence: z.object({
    trackedCount: z.number().int().min(0),
    onTrackCount: z.number().int().min(0),
    nearLimitCount: z.number().int().min(0),
    overLimitCount: z.number().int().min(0),
    items: z.array(advisorBudgetItemSchema).max(8),
  }),
  recurringOutflows: z.object({
    rules: z.array(advisorRecurringRuleItemSchema).max(5),
    merchants: z.array(advisorRecurringMerchantItemSchema).max(5),
  }),
  flags: advisorFlagsSchema,
  advice: advisorAdviceSchema,
});

export const advisorActionBudgetItemSchema = z.object({
  categoryId: z.string().trim().min(1),
  limitAmount: z.number().positive(),
});

export const advisorActionBudgetInputSchema = z.object({
  month: monthStringSchema,
  items: z.array(advisorActionBudgetItemSchema).min(1).max(8),
});

export const advisorActionBudgetResultSchema = z.object({
  categoryId: z.string().min(1),
  budgetId: z.string().min(1),
  month: monthStringSchema,
  limitAmount: z.number().positive(),
});

export const advisorActionBudgetResponseSchema = z.object({
  createdCount: z.number().int().min(0),
  updatedCount: z.number().int().min(0),
  budgets: z.array(advisorActionBudgetResultSchema),
});

export const advisorActionRecurringInputSchema = z.object({
  accountId: z.string().trim().min(1),
  categoryId: z.string().trim().min(1),
  amount: z.number().positive(),
  cadence: recurringCadenceSchema,
  description: z.string().trim().min(1).max(160).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  startAt: dateTimeStringSchema.optional(),
  isPaused: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.cadence === 'weekly' && value.dayOfWeek === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'dayOfWeek is required for weekly cadence',
      path: ['dayOfWeek'],
    });
  }

  if (value.cadence === 'monthly' && value.dayOfMonth === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'dayOfMonth is required for monthly cadence',
      path: ['dayOfMonth'],
    });
  }
});

export const advisorActionRecurringResponseSchema = z.object({
  rule: z.lazy(() => recurringRuleSchema),
});

export const advisorActionTransferInputSchema = transferCreateInputSchema;
export const advisorActionTransferResponseSchema = transferCreateResponseSchema;

export const groupMemberSchema = z.object({
  id: z.string().min(1),
  email: emailSchema,
  name: z.string().min(1).max(120),
  userId: z.string().min(1).nullable(),
});

export const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  ownerUserId: z.string().min(1),
  members: z.array(groupMemberSchema),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const groupListResponseSchema = z.object({
  groups: z.array(groupSchema),
});

export const groupCreateInputMemberSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  userId: z.string().trim().min(1).optional(),
});

export const groupCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ownerName: z.string().trim().min(1).max(120).optional(),
  members: z.array(groupCreateInputMemberSchema).default([]),
});

export const groupExpenseSplitSchema = z.object({
  memberId: z.string().trim().min(1),
  amount: z.number().nonnegative(),
});

export const groupExpenseSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  paidByMemberId: z.string().min(1),
  title: z.string().min(1).max(160),
  amount: z.number().positive(),
  currency: currencySchema,
  splits: z.array(groupExpenseSplitSchema),
  settledAt: dateTimeStringSchema.nullable(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const groupExpenseCreateInputSchema = z.object({
  paidByMemberId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(160),
  amount: z.number().positive(),
  currency: currencySchema,
  splits: z.array(groupExpenseSplitSchema).min(1),
});

export const groupExpenseListResponseSchema = z.object({
  expenses: z.array(groupExpenseSchema),
});

export const groupSettleResponseSchema = z.object({
  ok: z.literal(true),
  settledCount: z.number().int().min(0),
});

export const budgetSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  month: monthStringSchema,
  limitAmount: z.number().positive(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const budgetListQuerySchema = z.object({
  month: monthStringSchema,
  includeDeleted: z.coerce.boolean().default(false),
});

export const budgetListItemSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  categoryName: z.string().min(1).max(120),
  month: monthStringSchema,
  limitAmount: z.number().positive(),
  spentAmount: z.number().min(0),
  remainingAmount: z.number(),
  percentUsed: z.number().min(0),
});

export const budgetListResponseSchema = z.object({
  budgets: z.array(budgetListItemSchema),
});

export const budgetCreateInputSchema = z.object({
  categoryId: z.string().trim().min(1),
  month: monthStringSchema,
  limitAmount: z.number().positive(),
});

export const budgetUpdateInputSchema = z.object({
  limitAmount: z.number().positive(),
});

export const recurringRuleSchema = z.object({
  id: z.string().min(1),
  kind: recurringKindSchema,
  accountId: z.string().min(1).nullable(),
  categoryId: z.string().min(1).nullable(),
  type: transactionTypeSchema.nullable(),
  fromAccountId: z.string().min(1).nullable(),
  toAccountId: z.string().min(1).nullable(),
  amount: z.number().positive(),
  description: z.string().max(500).nullable(),
  cadence: recurringCadenceSchema,
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  dayOfMonth: z.number().int().min(1).max(28).nullable(),
  startAt: dateTimeStringSchema,
  endAt: dateTimeStringSchema.nullable(),
  nextRunAt: dateTimeStringSchema,
  lastRunAt: dateTimeStringSchema.nullable(),
  isPaused: z.boolean(),
  deletedAt: dateTimeStringSchema.nullable(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

const recurringScheduleFieldsSchema = z
  .object({
    cadence: recurringCadenceSchema,
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.cadence === 'weekly') {
      if (value.dayOfWeek === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '`dayOfWeek` is required for weekly cadence',
          path: ['dayOfWeek'],
        });
      }
      return;
    }

    if (value.dayOfMonth === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`dayOfMonth` is required for monthly cadence',
        path: ['dayOfMonth'],
      });
    }
  });

const recurringBaseCreateSchema = z.object({
  cadence: recurringCadenceSchema,
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  startAt: dateTimeStringSchema,
  endAt: dateTimeStringSchema.optional(),
  amount: z.number().positive(),
  description: z.string().trim().max(500).optional(),
});

export const recurringCreateInputSchema = z
  .discriminatedUnion('kind', [
    recurringBaseCreateSchema.extend({
      kind: z.literal('normal'),
      accountId: z.string().trim().min(1),
      categoryId: z.string().trim().min(1),
      type: transactionTypeSchema,
    }),
    recurringBaseCreateSchema.extend({
      kind: z.literal('transfer'),
      fromAccountId: z.string().trim().min(1),
      toAccountId: z.string().trim().min(1),
    }),
  ])
  .and(recurringScheduleFieldsSchema);

export const recurringUpdateInputSchema = z
  .object({
    amount: z.number().positive().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isPaused: z.boolean().optional(),
    cadence: recurringCadenceSchema.optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    endAt: dateTimeStringSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  })
  .superRefine((value, ctx) => {
    const cadence = value.cadence;
    if (cadence === 'weekly' && value.dayOfWeek === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`dayOfWeek` is required when setting weekly cadence',
        path: ['dayOfWeek'],
      });
    }
    if (cadence === 'monthly' && value.dayOfMonth === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`dayOfMonth` is required when setting monthly cadence',
        path: ['dayOfMonth'],
      });
    }
  });

export const recurringListQuerySchema = z.object({
  month: monthStringSchema.optional(),
  includeDeleted: z.coerce.boolean().default(false),
});

export const recurringListResponseSchema = z.object({
  rules: z.array(recurringRuleSchema),
});

export const recurringRunDueResponseSchema = z.object({
  processedRules: z.number().int().min(0),
  processedRuns: z.number().int().min(0),
  generatedTransactions: z.number().int().min(0),
});

export const exportTransactionsQuerySchema = z
  .object({
    from: dateTimeStringSchema.optional(),
    to: dateTimeStringSchema.optional(),
    accountId: z.string().trim().min(1).optional(),
    type: transactionTypeSchema.optional(),
    kind: transactionKindSchema.optional(),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) {
        return true;
      }
      return new Date(value.from).getTime() <= new Date(value.to).getTime();
    },
    {
      message: '`from` must be less than or equal to `to`',
      path: ['from'],
    },
  );

export const exportTransactionsCsvResponseSchema = z.string();

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type OauthProvider = z.infer<typeof oauthProviderSchema>;
export type OauthInput = z.infer<typeof oauthInputSchema>;
export type RefreshInput = z.infer<typeof refreshInputSchema>;
export type LogoutInput = z.infer<typeof logoutInputSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type RiskProfile = z.infer<typeof riskProfileSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type MeUpdateInput = z.infer<typeof meUpdateInputSchema>;
export type MePreferences = z.infer<typeof mePreferencesSchema>;
export type MePreferencesResponse = z.infer<typeof mePreferencesResponseSchema>;
export type MePreferencesUpdateInput = z.infer<typeof mePreferencesUpdateInputSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;
export type CategoryType = z.infer<typeof categoryTypeSchema>;
export type TransactionType = z.infer<typeof transactionTypeSchema>;
export type TransactionKind = z.infer<typeof transactionKindSchema>;
export type TransferDirection = z.infer<typeof transferDirectionSchema>;
export type RecurringCadence = z.infer<typeof recurringCadenceSchema>;
export type RecurringKind = z.infer<typeof recurringKindSchema>;
export type Account = z.infer<typeof accountSchema>;
export type AccountListResponse = z.infer<typeof accountListResponseSchema>;
export type AccountCreateInput = z.infer<typeof accountCreateInputSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateInputSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateInputSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionCreateInput = z.infer<typeof transactionCreateInputSchema>;
export type TransactionUpdateInput = z.infer<typeof transactionUpdateInputSchema>;
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>;
export type AccountBalance = z.infer<typeof accountBalanceSchema>;
export type UpcomingPaymentType = z.infer<typeof upcomingPaymentTypeSchema>;
export type UpcomingPaymentStatus = z.infer<typeof upcomingPaymentStatusSchema>;
export type UpcomingPaymentSource = z.infer<typeof upcomingPaymentSourceSchema>;
export type UpcomingPaymentMeta = z.infer<typeof upcomingPaymentMetaSchema>;
export type UpcomingPayment = z.infer<typeof upcomingPaymentSchema>;
export type UpcomingPaymentListQuery = z.infer<typeof upcomingPaymentListQuerySchema>;
export type UpcomingPaymentListResponse = z.infer<typeof upcomingPaymentListResponseSchema>;
export type UpcomingPaymentCreateInput = z.infer<typeof upcomingPaymentCreateInputSchema>;
export type UpcomingPaymentUpdateInput = z.infer<typeof upcomingPaymentUpdateInputSchema>;
export type UpcomingPaymentMarkPaidInput = z.infer<typeof upcomingPaymentMarkPaidInputSchema>;
export type UpcomingPaymentMarkPaidResponse = z.infer<typeof upcomingPaymentMarkPaidResponseSchema>;
export type DashboardRecentResponse = z.infer<typeof dashboardRecentResponseSchema>;
export type TransferCreateInput = z.infer<typeof transferCreateInputSchema>;
export type TransferCreateResponse = z.infer<typeof transferCreateResponseSchema>;
export type AnalyticsSummaryQuery = z.infer<typeof analyticsSummaryQuerySchema>;
export type AnalyticsTopCategory = z.infer<typeof analyticsTopCategorySchema>;
export type AnalyticsSummaryResponse = z.infer<typeof analyticsSummaryResponseSchema>;
export type AnalyticsByCategoryQuery = z.infer<typeof analyticsByCategoryQuerySchema>;
export type AnalyticsByCategoryItem = z.infer<typeof analyticsByCategoryItemSchema>;
export type AnalyticsByCategoryResponse = z.infer<typeof analyticsByCategoryResponseSchema>;
export type AnalyticsTrendQuery = z.infer<typeof analyticsTrendQuerySchema>;
export type AnalyticsTrendPoint = z.infer<typeof analyticsTrendPointSchema>;
export type AnalyticsTrendResponse = z.infer<typeof analyticsTrendResponseSchema>;
export type AiAdviceSeverity = z.infer<typeof aiAdviceSeveritySchema>;
export type AiAdviceQuery = z.infer<typeof aiAdviceQuerySchema>;
export type AiAdviceItem = z.infer<typeof aiAdviceItemSchema>;
export type AiAdviceBudgetOverrun = z.infer<typeof aiAdviceBudgetOverrunSchema>;
export type AiAdviceResponse = z.infer<typeof aiAdviceResponseSchema>;
export type WeeklyReportQuery = z.infer<typeof weeklyReportQuerySchema>;
export type WeeklyReportResponse = z.infer<typeof weeklyReportResponseSchema>;
export type AiInsightsLanguage = z.infer<typeof aiInsightsLanguageSchema>;
export type AiInsightsQuery = z.infer<typeof aiInsightsQuerySchema>;
export type AiInsightsResponse = z.infer<typeof aiInsightsResponseSchema>;
export type AdvisorInsightsQuery = z.infer<typeof advisorInsightsQuerySchema>;
export type AdvisorInsightMode = z.infer<typeof advisorInsightModeSchema>;
export type AdvisorInsightProvider = z.infer<typeof advisorInsightProviderSchema>;
export type AdvisorCashflowPoint = z.infer<typeof advisorCashflowPointSchema>;
export type AdvisorCategoryBreakdownItem = z.infer<typeof advisorCategoryBreakdownItemSchema>;
export type AdvisorBudgetStatus = z.infer<typeof advisorBudgetStatusSchema>;
export type AdvisorBudgetItem = z.infer<typeof advisorBudgetItemSchema>;
export type AdvisorRecurringRuleItem = z.infer<typeof advisorRecurringRuleItemSchema>;
export type AdvisorRecurringMerchantItem = z.infer<typeof advisorRecurringMerchantItemSchema>;
export type AdvisorFlags = z.infer<typeof advisorFlagsSchema>;
export type AdvisorOverview = z.infer<typeof advisorOverviewSchema>;
export type AdvisorSavingsAdvice = z.infer<typeof advisorSavingsAdviceSchema>;
export type AdvisorRiskLevel = z.infer<typeof advisorRiskLevelSchema>;
export type AdvisorEmergencyFundStatus = z.infer<typeof advisorEmergencyFundStatusSchema>;
export type AdvisorRiskProfile = z.infer<typeof advisorRiskProfileSchema>;
export type AdvisorInvestmentAdvice = z.infer<typeof advisorInvestmentAdviceSchema>;
export type AdvisorCutCandidate = z.infer<typeof advisorCutCandidateSchema>;
export type AdvisorExpenseOptimization = z.infer<typeof advisorExpenseOptimizationSchema>;
export type AdvisorAdvice = z.infer<typeof advisorAdviceSchema>;
export type AdvisorInsight = z.infer<typeof advisorInsightSchema>;
export type AdvisorActionBudgetItem = z.infer<typeof advisorActionBudgetItemSchema>;
export type AdvisorActionBudgetInput = z.infer<typeof advisorActionBudgetInputSchema>;
export type AdvisorActionBudgetResult = z.infer<typeof advisorActionBudgetResultSchema>;
export type AdvisorActionBudgetResponse = z.infer<typeof advisorActionBudgetResponseSchema>;
export type AdvisorActionRecurringInput = z.infer<typeof advisorActionRecurringInputSchema>;
export type AdvisorActionRecurringResponse = z.infer<typeof advisorActionRecurringResponseSchema>;
export type AdvisorActionTransferInput = z.infer<typeof advisorActionTransferInputSchema>;
export type AdvisorActionTransferResponse = z.infer<typeof advisorActionTransferResponseSchema>;
export type GroupMember = z.infer<typeof groupMemberSchema>;
export type Group = z.infer<typeof groupSchema>;
export type GroupListResponse = z.infer<typeof groupListResponseSchema>;
export type GroupCreateInputMember = z.infer<typeof groupCreateInputMemberSchema>;
export type GroupCreateInput = z.infer<typeof groupCreateInputSchema>;
export type GroupExpenseSplit = z.infer<typeof groupExpenseSplitSchema>;
export type GroupExpense = z.infer<typeof groupExpenseSchema>;
export type GroupExpenseCreateInput = z.infer<typeof groupExpenseCreateInputSchema>;
export type GroupExpenseListResponse = z.infer<typeof groupExpenseListResponseSchema>;
export type GroupSettleResponse = z.infer<typeof groupSettleResponseSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type BudgetListQuery = z.infer<typeof budgetListQuerySchema>;
export type BudgetListItem = z.infer<typeof budgetListItemSchema>;
export type BudgetListResponse = z.infer<typeof budgetListResponseSchema>;
export type BudgetCreateInput = z.infer<typeof budgetCreateInputSchema>;
export type BudgetUpdateInput = z.infer<typeof budgetUpdateInputSchema>;
export type RecurringRule = z.infer<typeof recurringRuleSchema>;
export type RecurringCreateInput = z.infer<typeof recurringCreateInputSchema>;
export type RecurringUpdateInput = z.infer<typeof recurringUpdateInputSchema>;
export type RecurringListQuery = z.infer<typeof recurringListQuerySchema>;
export type RecurringListResponse = z.infer<typeof recurringListResponseSchema>;
export type RecurringRunDueResponse = z.infer<typeof recurringRunDueResponseSchema>;
export type ExportTransactionsQuery = z.infer<typeof exportTransactionsQuerySchema>;
export type ExportTransactionsCsvResponse = z.infer<typeof exportTransactionsCsvResponseSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
