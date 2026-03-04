import { z } from 'zod';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  user: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string().nullable(),
  }),
});

export const adminSessionSchema = z.object({
  admin: z
    .object({
      id: z.string().min(1),
      email: z.string().email(),
      name: z.string().nullable(),
      role: z.literal('admin'),
      createdAt: z.string().datetime(),
    })
    .nullable(),
});

export const overviewSchema = z.object({
  totalUsers: z.number().nonnegative(),
  activeUsers: z.object({
    dau: z.number().nonnegative(),
    wau: z.number().nonnegative(),
    mau: z.number().nonnegative(),
  }),
  newUsers: z.object({
    last7Days: z.number().nonnegative(),
    last30Days: z.number().nonnegative(),
  }),
  totalTransactions: z.number().nonnegative(),
  totalIncome: z.number(),
  totalExpense: z.number(),
  net: z.number(),
  avgDailyTransactions: z.object({
    last7Days: z.number(),
    last30Days: z.number(),
  }),
  topCurrencies: z.array(
    z.object({
      currency: z.string(),
      count: z.number().nonnegative(),
      totalAmount: z.number(),
    }),
  ),
  transfersCount: z.number().nonnegative(),
  deletedTransactionsCount: z.number().nonnegative(),
  dataQuality: z.object({
    missingCategoryCount: z.number().nonnegative(),
    transferRatio: z.number(),
    deletedRatio: z.number(),
  }),
  activationFunnel: z.object({
    signupsLast30Days: z.number().nonnegative(),
    usersWithFirstTransactionLast30Days: z.number().nonnegative(),
    conversionRate: z.number(),
    medianDaysToFirstTransaction: z.number(),
  }),
  behaviorSegments: z.object({
    transferHeavyUsersCount: z.number().nonnegative(),
    transferHeavyUsersRatio: z.number(),
    multiCurrencyUsersCount: z.number().nonnegative(),
    multiCurrencyUsersRatio: z.number(),
    usersWithoutTransactionsCount: z.number().nonnegative(),
    usersWithoutTransactionsRatio: z.number(),
  }),
  financialSignals: z.object({
    averageSavingsRateProxy: z.number(),
    expenseToIncomeDistribution: z.array(
      z.object({
        label: z.string(),
        min: z.number(),
        max: z.number(),
        count: z.number().nonnegative(),
      }),
    ),
    medianNetByMonth: z.array(
      z.object({
        month: z.string().datetime().nullable(),
        medianNet: z.number(),
      }),
    ),
  }),
  generatedAt: z.string().datetime(),
});

export const timeseriesSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: z.enum(['day', 'week', 'month']),
  timezone: z.string(),
  currency: z.string().nullable(),
  buckets: z.array(
    z.object({
      bucketStart: z.string().datetime().nullable(),
      income: z.number(),
      expense: z.number(),
      net: z.number(),
      count: z.number().nonnegative(),
    }),
  ),
});

export const categoryAnalyticsSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  type: z.enum(['income', 'expense']).nullable(),
  currency: z.string().nullable(),
  categories: z.array(
    z.object({
      categoryKey: z.string(),
      total: z.number(),
      percentOfTotal: z.number(),
      trendVsPreviousPeriod: z.number(),
      changePercent: z.number(),
    }),
  ),
});

export const usersListSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().nonnegative(),
  totalPages: z.number().nonnegative(),
  users: z.array(
    z.object({
      id: z.string().min(1),
      email: z.string().email(),
      name: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      lastActiveAt: z.string().datetime().nullable(),
      activeDerivedFrom: z.enum(['lastActiveAt', 'transactions', 'none']),
      isActive: z.boolean(),
      notificationsEnabled: z.boolean(),
      expoPushTokensCount: z.number().nonnegative(),
      expoPushTokensLastUpdatedAt: z.string().datetime().nullable(),
      providers: z.array(z.enum(['google', 'apple'])),
      baseCurrency: z.string().nullable(),
      savingsTargetRate: z.number(),
      riskProfile: z.enum(['low', 'medium', 'high']),
    }),
  ),
});

export const userDetailSchema = z.object({
  user: z
    .object({
      id: z.string().min(1),
      email: z.string().email(),
      name: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      lastActiveAt: z.string().datetime().nullable(),
      activeDerivedFrom: z.enum(['lastActiveAt', 'transactions', 'none']),
      isActive: z.boolean(),
      notificationsEnabled: z.boolean(),
      expoPushTokensCount: z.number().nonnegative(),
      expoPushTokensLastUpdatedAt: z.string().datetime().nullable(),
      providers: z.array(z.enum(['google', 'apple'])),
      baseCurrency: z.string().nullable(),
      savingsTargetRate: z.number(),
      riskProfile: z.enum(['low', 'medium', 'high']),
      transactionStats: z.object({
        count: z.number().nonnegative(),
        firstTransactionAt: z.string().datetime().nullable(),
        lastTransactionAt: z.string().datetime().nullable(),
        currenciesUsed: z.array(z.string()),
        transferRatio: z.number(),
        incomeTotal: z.number(),
        expenseTotal: z.number(),
      }),
      notificationSummary: z.object({
        tokensCount: z.number().nonnegative(),
        lastUpdatedAt: z.string().datetime().nullable(),
        platformSplit: z.object({
          ios: z.number().nonnegative(),
          android: z.number().nonnegative(),
        }),
      }),
      activity: z.object({
        lastActiveAt: z.string().datetime().nullable(),
        isActive: z.boolean(),
      }),
    })
    .nullable(),
});

export const transactionsListSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().nonnegative(),
  totalPages: z.number().nonnegative(),
  totals: z.object({
    countTotal: z.number().nonnegative(),
    incomeTotal: z.number(),
    expenseTotal: z.number(),
    netTotal: z.number(),
  }),
  transactions: z.array(
    z.object({
      id: z.string().min(1),
      userId: z.string().min(1),
      accountId: z.string().min(1),
      categoryId: z.string().nullable(),
      categoryKey: z.string().nullable(),
      type: z.enum(['income', 'expense']),
      kind: z.enum(['normal', 'transfer']),
      transferGroupId: z.string().nullable(),
      transferDirection: z.enum(['in', 'out']).nullable(),
      relatedAccountId: z.string().nullable(),
      amount: z.number(),
      currency: z.string(),
      description: z.string().nullable(),
      occurredAt: z.string().datetime(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      deletedAt: z.string().datetime().nullable(),
      user: z.object({
        id: z.string().min(1),
        email: z.string().email(),
        name: z.string().nullable(),
      }),
    }),
  ),
});

export const retentionSchema = z.object({
  mode: z.literal('simplified'),
  label: z.string(),
  cohort: z.enum(['weekly', 'monthly']),
  from: z.string().datetime(),
  to: z.string().datetime(),
  cohorts: z.array(
    z.object({
      cohortStart: z.string().datetime(),
      cohortSize: z.number().nonnegative(),
      retained_1: z.number().nonnegative(),
      retained_2: z.number().nonnegative(),
      retained_3: z.number().nonnegative(),
      retainedRates: z.object({
        retained_1: z.number(),
        retained_2: z.number(),
        retained_3: z.number(),
      }),
    }),
  ),
});

export const notificationTokensSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().nonnegative(),
  totalPages: z.number().nonnegative(),
  summary: z.object({
    totalUsers: z.number().nonnegative(),
    usersWithTokens: z.number().nonnegative(),
    usersMissingTokens: z.number().nonnegative(),
    platformSplit: z.object({
      ios: z.number().nonnegative(),
      android: z.number().nonnegative(),
    }),
  }),
  users: z.array(
    z.object({
      id: z.string().min(1),
      email: z.string().email(),
      name: z.string().nullable(),
      tokensCount: z.number().nonnegative(),
      lastUpdatedAt: z.string().datetime().nullable(),
      platformSplit: z.object({
        ios: z.number().nonnegative(),
        android: z.number().nonnegative(),
      }),
    }),
  ),
});

export const adminSendNotificationResponseSchema = z.object({
  targeted: z.number().nonnegative(),
  sent: z.number().nonnegative(),
  noToken: z.number().nonnegative(),
  debug: z.object({
    tokensFound: z.number().nonnegative(),
    tickets: z.object({
      total: z.number().nonnegative(),
      ok: z.number().nonnegative(),
      error: z.number().nonnegative(),
    }),
    receipts: z.object({
      total: z.number().nonnegative(),
      ok: z.number().nonnegative(),
      error: z.number().nonnegative(),
      pending: z.number().nonnegative(),
    }),
    ticketErrors: z.array(
      z.object({
        code: z.string(),
        count: z.number().nonnegative(),
      }),
    ),
    receiptErrors: z.array(
      z.object({
        code: z.string(),
        count: z.number().nonnegative(),
      }),
    ),
  }),
});

export type AdminSession = z.infer<typeof adminSessionSchema>;
export type OverviewResponse = z.infer<typeof overviewSchema>;
export type TimeseriesResponse = z.infer<typeof timeseriesSchema>;
export type CategoryAnalyticsResponse = z.infer<typeof categoryAnalyticsSchema>;
export type UsersListResponse = z.infer<typeof usersListSchema>;
export type UserDetailResponse = z.infer<typeof userDetailSchema>;
export type TransactionsListResponse = z.infer<typeof transactionsListSchema>;
export type RetentionResponse = z.infer<typeof retentionSchema>;
export type NotificationTokensResponse = z.infer<typeof notificationTokensSchema>;
export type AdminSendNotificationResponse = z.infer<typeof adminSendNotificationResponseSchema>;
