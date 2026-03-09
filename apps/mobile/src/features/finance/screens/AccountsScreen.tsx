import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  accountCreateInputSchema,
  accountTypeSchema,
  type Account,
  type AccountCreateInput,
  type AccountType,
  type AccountUpdateInput,
} from '@mintly/shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useAuth } from '@app/providers/AuthProvider';
import { apiClient } from '@core/api/client';
import { financeQueryKeys } from '@core/api/queryKeys';
import type { TransferScreenParams } from '@core/navigation/stacks/AddStack';
import type { ProfileStackParamList } from '@core/navigation/stacks/ProfileStack';
import type { RootTabParamList } from '@core/navigation/types';
import { useI18n } from '@shared/i18n';
import { Card, Chip, PrimaryButton, ScreenContainer, Section, showAlert } from '@shared/ui';
import { colors, radius, spacing, typography } from '@shared/theme';
import { apiErrorText } from '@shared/utils/apiErrorText';

const accountTypes: AccountType[] = ['cash', 'bank', 'credit', 'debt_lent', 'debt_borrowed', 'loan'];
const LIABILITY_ACCOUNT_TYPES: AccountType[] = ['credit', 'debt_borrowed', 'loan'];

type LoanActionMode = 'payment' | 'earlyPayoff';

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
};

type LoanActionState = {
  accountId: string | null;
  mode: LoanActionMode | null;
  fromAccountId: string;
  amount: string;
  occurredAt: string;
  note: string;
};

function isLiabilityAccountType(type: AccountType): boolean {
  return LIABILITY_ACCOUNT_TYPES.includes(type);
}

function parseSignedAmount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '.');
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function maskIdentifierForDebug(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= 10) {
    return `${normalized.slice(0, 4)}...`;
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function looksLikeIsoDateTime(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

function logLoanCreateDebug(stage: string, details: Record<string, unknown>): void {
  console.log(`[accounts][loan-create] ${stage}`, details);
}

function summarizeFormErrorsForDebug(
  errors: Partial<Record<keyof CreateAccountFormValues, { message?: unknown }>>,
): Record<string, string> {
  const summary: Record<string, string> = {};

  for (const [field, error] of Object.entries(errors)) {
    const message = typeof error?.message === 'string' ? error.message : 'validation_error';
    summary[field] = message;
  }

  return summary;
}

function parsePositiveAmount(value: string): number | null {
  const parsed = parseSignedAmount(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parsePositiveInteger(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '.');
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeDateTimeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dateOnly = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(dateOnly.getTime()) ? null : dateOnly.toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString().slice(0, 10);
}

function formatSignedBalance(amount: number, currency: string, locale: string): string {
  const safeAmount = toFiniteNumber(amount, 0);
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Math.abs(safeAmount));

  if (safeAmount > 0) {
    return `+${formatted}`;
  }

  if (safeAmount < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

function formatAbsoluteMoney(amount: number, currency: string, locale: string): string {
  const safeAmount = toFiniteNumber(amount, 0);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Math.abs(safeAmount));
}

function formatDateLabel(value: string | null | undefined, locale: string): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function resolveFormErrorText(
  message: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!message) {
    return '';
  }

  if (message.includes('.')) {
    return t(message);
  }

  return message;
}

function extractValidationErrorMessage(
  error: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }

  const code = typeof error.code === 'string' ? error.code : null;
  if (code !== 'VALIDATION_ERROR') {
    return null;
  }

  const details = 'details' in error ? error.details : null;
  if (!details || typeof details !== 'object') {
    return t('errors.api.VALIDATION_ERROR');
  }

  const detailsRecord = details as {
    formErrors?: unknown;
    fieldErrors?: Record<string, unknown>;
  };

  if (Array.isArray(detailsRecord.formErrors)) {
    const firstFormError = detailsRecord.formErrors.find(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );
    if (firstFormError) {
      return resolveFormErrorText(firstFormError, t);
    }
  }

  const fieldErrors = detailsRecord.fieldErrors;
  if (fieldErrors && typeof fieldErrors === 'object') {
    for (const value of Object.values(fieldErrors)) {
      if (!Array.isArray(value)) {
        continue;
      }

      const firstFieldError = value.find(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      );
      if (firstFieldError) {
        return resolveFormErrorText(firstFieldError, t);
      }
    }
  }

  return t('errors.api.VALIDATION_ERROR');
}

const optionalShortTextSchema = z.string().trim().max(500).optional();

const createAccountFormSchema = z
  .object({
    name: accountCreateInputSchema.shape.name,
    type: accountCreateInputSchema.shape.type,
    currency: accountCreateInputSchema.shape.currency,
    openingBalance: z.string().trim().optional(),
    loanBorrowedAmount: z.string().trim().optional(),
    loanTotalRepayable: z.string().trim().optional(),
    loanMonthlyPayment: z.string().trim().optional(),
    loanInstallmentCount: z.string().trim().optional(),
    loanPaymentDay: z.string().trim().optional(),
    loanFirstPaymentDate: z.string().trim().optional(),
    loanPaymentAccountId: z.string().trim().optional(),
    loanNote: optionalShortTextSchema,
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'loan') {
      const openingBalance = value.openingBalance ?? '';
      if (!openingBalance.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openingBalance'],
          message: 'errors.validation.amountRequired',
        });
      } else if (parseSignedAmount(openingBalance) === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openingBalance'],
          message: 'errors.validation.invalidSignedAmount',
        });
      }
      return;
    }

    const borrowedAmount = parsePositiveAmount(value.loanBorrowedAmount ?? '');
    const totalRepayable = parsePositiveAmount(value.loanTotalRepayable ?? '');
    const monthlyPayment = parsePositiveAmount(value.loanMonthlyPayment ?? '');
    const installmentCount = parsePositiveInteger(value.loanInstallmentCount ?? '');
    const paymentDay = parsePositiveInteger(value.loanPaymentDay ?? '');
    const firstPaymentDate = normalizeDateTimeInput(value.loanFirstPaymentDate ?? '');

    if (borrowedAmount === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanBorrowedAmount'],
        message: 'errors.validation.amountPositive',
      });
    }

    if (totalRepayable === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanTotalRepayable'],
        message: 'errors.validation.amountPositive',
      });
    }

    if (borrowedAmount !== null && totalRepayable !== null && totalRepayable < borrowedAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanTotalRepayable'],
        message: 'errors.validation.loanTotalRepayableMin',
      });
    }

    if (monthlyPayment === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanMonthlyPayment'],
        message: 'errors.validation.amountPositive',
      });
    }

    if (installmentCount === null || installmentCount < 1 || installmentCount > 360) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanInstallmentCount'],
        message: 'errors.validation.loanInstallmentCountRange',
      });
    }

    if (paymentDay === null || paymentDay < 1 || paymentDay > 28) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanPaymentDay'],
        message: 'errors.validation.dayOfMonthRange',
      });
    }

    if (!firstPaymentDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanFirstPaymentDate'],
        message: 'errors.validation.startDateTimeRequired',
      });
    }
  });

const editAccountFormSchema = z
  .object({
    name: z.string().trim().min(1, 'errors.validation.nameRequired').max(120),
    type: accountTypeSchema,
    openingBalance: z.string().trim().optional(),
    loanBorrowedAmount: z.string().trim().optional(),
    loanTotalRepayable: z.string().trim().optional(),
    loanMonthlyPayment: z.string().trim().optional(),
    loanInstallmentCount: z.string().trim().optional(),
    loanPaymentDay: z.string().trim().optional(),
    loanFirstPaymentDate: z.string().trim().optional(),
    loanPaymentAccountId: z.string().trim().optional(),
    loanNote: optionalShortTextSchema,
  })
  .superRefine((value, ctx) => {
    if (value.type !== 'loan') {
      const openingBalance = value.openingBalance ?? '';
      if (!openingBalance.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openingBalance'],
          message: 'errors.validation.amountRequired',
        });
      } else if (parseSignedAmount(openingBalance) === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openingBalance'],
          message: 'errors.validation.invalidSignedAmount',
        });
      }
      return;
    }

    const borrowedAmount = parsePositiveAmount(value.loanBorrowedAmount ?? '');
    const totalRepayable = parsePositiveAmount(value.loanTotalRepayable ?? '');
    const monthlyPayment = parsePositiveAmount(value.loanMonthlyPayment ?? '');
    const installmentCount = parsePositiveInteger(value.loanInstallmentCount ?? '');
    const paymentDay = parsePositiveInteger(value.loanPaymentDay ?? '');
    const firstPaymentDate = normalizeDateTimeInput(value.loanFirstPaymentDate ?? '');

    if (borrowedAmount === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanBorrowedAmount'],
        message: 'errors.validation.amountPositive',
      });
    }

    if (totalRepayable === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanTotalRepayable'],
        message: 'errors.validation.amountPositive',
      });
    }

    if (borrowedAmount !== null && totalRepayable !== null && totalRepayable < borrowedAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanTotalRepayable'],
        message: 'errors.validation.loanTotalRepayableMin',
      });
    }

    if (monthlyPayment === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanMonthlyPayment'],
        message: 'errors.validation.amountPositive',
      });
    }

    if (installmentCount === null || installmentCount < 1 || installmentCount > 360) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanInstallmentCount'],
        message: 'errors.validation.loanInstallmentCountRange',
      });
    }

    if (paymentDay === null || paymentDay < 1 || paymentDay > 28) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanPaymentDay'],
        message: 'errors.validation.dayOfMonthRange',
      });
    }

    if (!firstPaymentDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['loanFirstPaymentDate'],
        message: 'errors.validation.startDateTimeRequired',
      });
    }
  });

type CreateAccountFormValues = z.infer<typeof createAccountFormSchema>;
type EditAccountFormValues = z.infer<typeof editAccountFormSchema>;

function getAccountTypeLabel(
  type: AccountType,
  t: (key: string, params?: Record<string, string | number>) => string,
  accountName?: string,
): string {
  const normalizedName = (accountName ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  if (
    normalizedName.includes('saving') ||
    normalizedName.includes('savings') ||
    normalizedName.includes('birikim') ||
    normalizedName.includes('tasarruf')
  ) {
    const savings = t('accounts.accountType.savings');
    if (savings) {
      return savings;
    }
  }

  const richKeyByType: Record<AccountType, string> = {
    bank: 'accounts.accountType.bankAccount',
    cash: 'accounts.accountType.cashWallet',
    credit: 'accounts.accountType.creditCard',
    debt_lent: 'accounts.accountType.debtLent',
    debt_borrowed: 'accounts.accountType.debtBorrowed',
    loan: 'accounts.accountType.loan',
  };

  const rich = t(richKeyByType[type]);
  if (rich) {
    return rich;
  }

  const primary = t(`accounts.accountType.${type}`);
  if (primary) {
    return primary;
  }

  const fallback = t(`dashboard.accountTypes.${type}`);
  if (fallback) {
    return fallback;
  }

  return type.toUpperCase();
}

function getLoanStatusLabel(
  status: 'active' | 'closed' | 'closed_early',
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (status === 'closed_early') {
    return t('accounts.loan.status.closedEarly');
  }
  return t(`accounts.loan.status.${status}`);
}

function buildLoanPayloadFromForm(
  values:
    | CreateAccountFormValues
    | EditAccountFormValues,
): NonNullable<AccountCreateInput['loan']> {
  const borrowedAmount = parsePositiveAmount(values.loanBorrowedAmount ?? '');
  const totalRepayable = parsePositiveAmount(values.loanTotalRepayable ?? '');
  const monthlyPayment = parsePositiveAmount(values.loanMonthlyPayment ?? '');
  const installmentCount = parsePositiveInteger(values.loanInstallmentCount ?? '');
  const paymentDay = parsePositiveInteger(values.loanPaymentDay ?? '');
  const firstPaymentDate = normalizeDateTimeInput(values.loanFirstPaymentDate ?? '');

  if (
    borrowedAmount === null ||
    totalRepayable === null ||
    monthlyPayment === null ||
    installmentCount === null ||
    paymentDay === null ||
    !firstPaymentDate
  ) {
    throw new Error('VALIDATION_ERROR');
  }

  if (
    !Number.isFinite(borrowedAmount) ||
    !Number.isFinite(totalRepayable) ||
    !Number.isFinite(monthlyPayment) ||
    !Number.isFinite(installmentCount) ||
    !Number.isFinite(paymentDay)
  ) {
    throw new Error('VALIDATION_ERROR');
  }

  return {
    borrowedAmount: toFiniteNumber(borrowedAmount, 0),
    totalRepayable: toFiniteNumber(totalRepayable, 0),
    monthlyPayment: toFiniteNumber(monthlyPayment, 0),
    installmentCount: Math.trunc(toFiniteNumber(installmentCount, 0)),
    paymentDay: Math.trunc(toFiniteNumber(paymentDay, 0)),
    firstPaymentDate,
    paymentAccountId: values.loanPaymentAccountId?.trim() || undefined,
    note: values.loanNote?.trim() || undefined,
  };
}

function initialLoanActionState(): LoanActionState {
  return {
    accountId: null,
    mode: null,
    fromAccountId: '',
    amount: '',
    occurredAt: new Date().toISOString(),
    note: '',
  };
}

export function AccountsScreen() {
  const { withAuth, user, refreshUser, logout } = useAuth();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const queryClient = useQueryClient();
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [loanActionState, setLoanActionState] = useState<LoanActionState>(initialLoanActionState);

  const baseCurrency = user?.baseCurrency ?? null;

  const accountsQuery = useQuery({
    queryKey: financeQueryKeys.accounts.list(),
    queryFn: () => withAuth((token) => apiClient.getAccounts(token)),
  });
  const dashboardQuery = useQuery({
    queryKey: financeQueryKeys.dashboard.recent(),
    queryFn: () => withAuth((token) => apiClient.getDashboardRecent(token)),
  });

  const accounts = accountsQuery.data?.accounts ?? [];

  const createForm = useForm<CreateAccountFormValues>({
    resolver: zodResolver(createAccountFormSchema),
    defaultValues: {
      name: '',
      type: 'bank',
      currency: baseCurrency ?? 'USD',
      openingBalance: '0',
      loanBorrowedAmount: '',
      loanTotalRepayable: '',
      loanMonthlyPayment: '',
      loanInstallmentCount: '',
      loanPaymentDay: '',
      loanFirstPaymentDate: toDateInputValue(new Date().toISOString()),
      loanPaymentAccountId: '',
      loanNote: '',
    },
  });

  const editForm = useForm<EditAccountFormValues>({
    resolver: zodResolver(editAccountFormSchema),
    defaultValues: {
      name: '',
      type: 'bank',
      openingBalance: '0',
      loanBorrowedAmount: '',
      loanTotalRepayable: '',
      loanMonthlyPayment: '',
      loanInstallmentCount: '',
      loanPaymentDay: '',
      loanFirstPaymentDate: toDateInputValue(new Date().toISOString()),
      loanPaymentAccountId: '',
      loanNote: '',
    },
  });

  useEffect(() => {
    if (baseCurrency) {
      createForm.setValue('currency', baseCurrency, { shouldValidate: true });
    }
  }, [baseCurrency, createForm]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setFeedback(null);
    }, 2500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [feedback]);

  const invalidateAccountRelatedQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.accounts.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.dashboard.recent() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.analytics.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.transactions.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.recurring.all() }),
      queryClient.invalidateQueries({ queryKey: financeQueryKeys.upcomingPayments.all() }),
    ]);
  }, [queryClient]);

  const balanceByAccountId = useMemo(
    () => new Map((dashboardQuery.data?.balances ?? []).map((balance) => [balance.accountId, balance.balance])),
    [dashboardQuery.data?.balances],
  );

  const createSelectedType = createForm.watch('type');
  const createOpeningBalance = parseSignedAmount(createForm.watch('openingBalance') ?? '') ?? 0;
  const createIsLoan = createSelectedType === 'loan';
  const createLoanPaymentAccountId = createForm.watch('loanPaymentAccountId');
  const createLooksLiability = createIsLoan || isLiabilityAccountType(createSelectedType) || createOpeningBalance < 0;

  const editSelectedType = editForm.watch('type');
  const editOpeningBalance = parseSignedAmount(editForm.watch('openingBalance') ?? '') ?? 0;
  const editIsLoan = editSelectedType === 'loan';
  const editLooksLiability = editIsLoan || isLiabilityAccountType(editSelectedType) || editOpeningBalance < 0;

  const createCurrency = (baseCurrency ?? createForm.watch('currency') ?? '').toUpperCase();
  const createLoanSourceAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.type !== 'loan' &&
          (!createCurrency || account.currency === createCurrency),
      ),
    [accounts, createCurrency],
  );

  useEffect(() => {
    if (!createIsLoan) {
      return;
    }

    const selectedSourceAccountId = createLoanPaymentAccountId?.trim() ?? '';
    if (!selectedSourceAccountId) {
      return;
    }

    const isSourceAccountAvailable = createLoanSourceAccounts.some((account) => account.id === selectedSourceAccountId);
    if (isSourceAccountAvailable) {
      return;
    }

    createForm.setValue('loanPaymentAccountId', '', { shouldValidate: true });
    logLoanCreateDebug('source_account_reset', {
      reason: 'source_account_not_available_for_selected_currency',
      selectedSourceAccountId: maskIdentifierForDebug(selectedSourceAccountId),
      selectedCurrency: createCurrency,
      availableSourceCount: createLoanSourceAccounts.length,
    });
  }, [createIsLoan, createLoanPaymentAccountId, createLoanSourceAccounts, createCurrency, createForm]);

  const createAccountMutation = useMutation({
    mutationFn: (values: CreateAccountFormValues) =>
      withAuth((token) => {
        const payload: AccountCreateInput = {
          name: values.name.trim(),
          type: values.type,
          currency: (baseCurrency ?? values.currency).toUpperCase(),
          openingBalance: values.type === 'loan' ? 0 : parseSignedAmount(values.openingBalance ?? '') ?? 0,
        };

        if (values.type === 'loan') {
          const loanPayload = buildLoanPayloadFromForm(values);
          payload.loan = loanPayload;
          logLoanCreateDebug('submit_payload', {
            accountType: values.type,
            sourceAccountSelected: Boolean(loanPayload.paymentAccountId),
            sourceAccountId: maskIdentifierForDebug(loanPayload.paymentAccountId ?? null),
            firstPaymentDate: loanPayload.firstPaymentDate,
            firstPaymentDateIsIsoDateTime: looksLikeIsoDateTime(loanPayload.firstPaymentDate),
            borrowedAmountValid: Number.isFinite(loanPayload.borrowedAmount) && loanPayload.borrowedAmount > 0,
            totalRepayableValid: Number.isFinite(loanPayload.totalRepayable) && loanPayload.totalRepayable > 0,
            monthlyPaymentValid: Number.isFinite(loanPayload.monthlyPayment) && loanPayload.monthlyPayment > 0,
            installmentCount: loanPayload.installmentCount,
            paymentDay: loanPayload.paymentDay,
          });
        }

        return apiClient.createAccount(payload, token);
      }),
    onSuccess: async () => {
      await invalidateAccountRelatedQueries();

      if (!baseCurrency) {
        await refreshUser();
      }

      createForm.reset({
        name: '',
        type: 'bank',
        currency: baseCurrency ?? createForm.getValues('currency'),
        openingBalance: '0',
        loanBorrowedAmount: '',
        loanTotalRepayable: '',
        loanMonthlyPayment: '',
        loanInstallmentCount: '',
        loanPaymentDay: '',
        loanFirstPaymentDate: toDateInputValue(new Date().toISOString()),
        loanPaymentAccountId: '',
        loanNote: '',
      });
      logLoanCreateDebug('submit_success', {
        accountType: createSelectedType,
      });
      setFeedback({ tone: 'success', message: t('accounts.create.success') });
    },
    onError: (error) => {
      const errorRecord = error as {
        code?: unknown;
        message?: unknown;
        status?: unknown;
        details?: unknown;
      };
      logLoanCreateDebug('submit_failed', {
        code: typeof errorRecord.code === 'string' ? errorRecord.code : 'unknown',
        message: typeof errorRecord.message === 'string' ? errorRecord.message : 'unknown',
        status: typeof errorRecord.status === 'number' ? errorRecord.status : null,
        hasDetails: Boolean(errorRecord.details),
      });

      if (error instanceof Error && error.message === 'VALIDATION_ERROR') {
        showAlert(t('common.error'), t('errors.validation.invalidIsoDateTime'));
      } else {
        const backendValidationMessage = extractValidationErrorMessage(error, t);
        showAlert(
          t('errors.account.createFailedTitle'),
          backendValidationMessage ?? apiErrorText(error),
        );
      }
      setFeedback({ tone: 'error', message: t('accounts.create.error') });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: (params: { id: string; values: EditAccountFormValues }) =>
      withAuth((token) => {
        const payload: AccountUpdateInput = {
          name: params.values.name.trim(),
          type: params.values.type,
        };

        if (params.values.type === 'loan') {
          payload.loan = buildLoanPayloadFromForm(params.values);
        } else {
          payload.openingBalance = parseSignedAmount(params.values.openingBalance ?? '') ?? 0;
        }

        return apiClient.updateAccount(params.id, payload, token);
      }),
    onSuccess: async () => {
      setEditingAccountId(null);
      await invalidateAccountRelatedQueries();
      setFeedback({ tone: 'success', message: t('accounts.update.success') });
    },
    onError: (error) => {
      const message = apiErrorText(error) || t('accounts.update.error');
      showAlert(t('errors.account.updateFailedTitle'), message);
      setFeedback({ tone: 'error', message: t('accounts.update.error') });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: string) => withAuth((token) => apiClient.deleteAccount(accountId, token)),
    onSuccess: async (_, accountId) => {
      if (editingAccountId === accountId) {
        setEditingAccountId(null);
      }
      await invalidateAccountRelatedQueries();
      setFeedback({ tone: 'success', message: t('accounts.delete.success') });
    },
    onError: (error) => {
      const message = apiErrorText(error) || t('accounts.delete.error');
      showAlert(t('errors.account.deleteFailedTitle'), message);
      setFeedback({ tone: 'error', message: t('accounts.delete.error') });
    },
  });

  const loanActionMutation = useMutation({
    mutationFn: (params: {
      mode: LoanActionMode;
      accountId: string;
      fromAccountId: string;
      amount: number;
      occurredAt?: string;
      note?: string;
    }) =>
      withAuth((token) => {
        if (params.mode === 'payment') {
          return apiClient.payLoanInstallment(
            params.accountId,
            {
              fromAccountId: params.fromAccountId,
              amount: params.amount,
              occurredAt: params.occurredAt,
              note: params.note,
            },
            token,
          );
        }

        return apiClient.earlyPayoffLoan(
          params.accountId,
          {
            fromAccountId: params.fromAccountId,
            amount: params.amount,
            occurredAt: params.occurredAt,
            note: params.note,
          },
          token,
        );
      }),
    onSuccess: async (_, variables) => {
      await invalidateAccountRelatedQueries();
      setLoanActionState(initialLoanActionState());
      setFeedback({
        tone: 'success',
        message:
          variables.mode === 'payment'
            ? t('accounts.loan.actionSuccessPayment')
            : t('accounts.loan.actionSuccessEarlyPayoff'),
      });
    },
    onError: (error) => {
      showAlert(t('common.error'), apiErrorText(error));
      setFeedback({ tone: 'error', message: t('common.error') });
    },
  });

  const editingAccount = useMemo(
    () => accounts.find((account) => account.id === editingAccountId) ?? null,
    [accounts, editingAccountId],
  );

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      showAlert(t('errors.auth.logoutFailedTitle'), apiErrorText(error));
    }
  }, [logout, t]);

  const openTransfer = useCallback(
    (params?: TransferScreenParams) => {
      const parent = navigation.getParent?.();
      if (!parent || !('navigate' in parent)) {
        return;
      }

      (
        parent as {
          navigate: (routeName: keyof RootTabParamList, params?: RootTabParamList['AddTab']) => void;
        }
      ).navigate('AddTab', {
        screen: 'Transfer',
        params,
      });
    },
    [navigation],
  );

  const openLoanAction = useCallback(
    (account: Account, mode: LoanActionMode, suggestedAmount: number) => {
      const sourceAccounts = accounts.filter(
        (candidate) =>
          candidate.id !== account.id &&
          candidate.type !== 'loan' &&
          candidate.currency === account.currency,
      );
      const defaultSource = account.loan?.paymentAccountId ?? sourceAccounts[0]?.id ?? '';

      setLoanActionState({
        accountId: account.id,
        mode,
        fromAccountId: defaultSource,
        amount: toFiniteNumber(suggestedAmount, 0) > 0
          ? String(Math.round(toFiniteNumber(suggestedAmount, 0) * 100) / 100)
          : '',
        occurredAt: new Date().toISOString(),
        note: '',
      });
    },
    [accounts],
  );

  const confirmDeleteAccount = useCallback(
    (accountId: string, accountName: string) => {
      if (deleteAccountMutation.isPending || updateAccountMutation.isPending) {
        return;
      }

      const accountBalance = balanceByAccountId.get(accountId) ?? 0;

      if (Math.abs(accountBalance) > 0.0001) {
        showAlert(
          t('accounts.delete.hasBalanceTitle', { defaultValue: 'Hesapta Bakiye Var' }),
          t('accounts.delete.hasBalanceBody', {
            defaultValue:
              'Bu hesabı silmeden önce içindeki bakiyeyi başka bir hesaba aktarmanız gerekmektedir.',
          }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('add.hub.transferAction'),
              onPress: () =>
                openTransfer({
                  deleteSourceAccountId: accountId,
                  deleteSourceAccountName: accountName,
                  deleteSourceBalance: accountBalance,
                }),
            },
          ],
        );
        return;
      }

      showAlert(t('accounts.delete.confirmTitle'), t('accounts.delete.confirmBody', { name: accountName }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteAccountMutation.mutate(accountId);
          },
        },
      ]);
    },
    [balanceByAccountId, deleteAccountMutation, openTransfer, t, updateAccountMutation.isPending],
  );

  if (accountsQuery.isLoading) {
    return (
      <ScreenContainer safeAreaEdges={['left', 'right']} contentStyle={styles.screenContent}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>{t('accounts.state.loading')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (accountsQuery.isError) {
    return (
      <ScreenContainer safeAreaEdges={['left', 'right']} contentStyle={styles.screenContent}>
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('accounts.state.loadErrorTitle')}</Text>
          <Text style={styles.errorText}>{apiErrorText(accountsQuery.error)}</Text>
          <PrimaryButton label={t('common.retry')} onPress={() => void accountsQuery.refetch()} />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <View style={styles.screenRoot}>
      <ScreenContainer safeAreaEdges={['left', 'right']} contentStyle={styles.screenContent}>
        <Section
          title={t('accounts.sections.baseCurrency.title')}
          subtitle={t('accounts.sections.baseCurrency.subtitle')}
        >
          <Card>
            <Text style={styles.baseCurrencyText}>
              {baseCurrency
                ? t('accounts.baseCurrency.value', { currency: baseCurrency })
                : t('accounts.baseCurrency.empty')}
            </Text>
          </Card>
        </Section>

        <Section
          title={t('accounts.sections.session.title')}
          subtitle={user?.email ?? t('accounts.session.signedIn')}
        >
          <Card style={styles.sessionCard}>
            <PrimaryButton iconName="swap-horizontal-outline" label={t('add.hub.transferAction')} onPress={openTransfer} />
            <PrimaryButton
              label={t('profile.logOut')}
              onPress={() => {
                void handleLogout();
              }}
            />
            <Pressable
              style={styles.secondaryAction}
              onPress={() => {
                void handleLogout();
              }}
            >
              <Text style={styles.secondaryActionText}>{t('profile.useDifferentAccount')}</Text>
            </Pressable>
          </Card>
        </Section>

        <Section title={t('accounts.sections.create.title')}>
          <Card style={styles.formCard}>
            <Text style={styles.fieldLabel}>{t('accounts.form.nameLabel')}</Text>
            <Controller
              control={createForm.control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  editable={!createAccountMutation.isPending}
                  placeholder={t('accounts.form.namePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                />
              )}
            />
            {createForm.formState.errors.name ? (
              <Text style={styles.errorText}>
                {resolveFormErrorText(createForm.formState.errors.name.message, t)}
              </Text>
            ) : null}

            <Text style={styles.fieldLabel}>{t('accounts.form.typeLabel')}</Text>
            <Controller
              control={createForm.control}
              name="type"
              render={({ field: { onChange, value } }) => (
                <TypePicker selected={value} onSelect={onChange} disabled={createAccountMutation.isPending} />
              )}
            />

            <Text style={styles.fieldLabel}>{t('accounts.form.currencyLabel')}</Text>
            <Controller
              control={createForm.control}
              name="currency"
              render={({ field: { onChange, onBlur, value } }) =>
                baseCurrency ? (
                  <Chip label={baseCurrency} tone="primary" />
                ) : (
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={(next) => onChange(next.toUpperCase())}
                    onBlur={onBlur}
                    editable={!createAccountMutation.isPending}
                    placeholder={t('accounts.form.currencyPlaceholder')}
                    autoCapitalize="characters"
                    maxLength={3}
                    placeholderTextColor={colors.textMuted}
                  />
                )
              }
            />
            {createForm.formState.errors.currency ? (
              <Text style={styles.errorText}>
                {resolveFormErrorText(createForm.formState.errors.currency.message, t)}
              </Text>
            ) : null}

            {createIsLoan ? (
              <>
                <Text style={styles.fieldLabel}>{t('accounts.form.loanBorrowedAmountLabel')}</Text>
                <Controller
                  control={createForm.control}
                  name="loanBorrowedAmount"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!createAccountMutation.isPending}
                      keyboardType="numbers-and-punctuation"
                      placeholder={t('accounts.form.loanBorrowedAmountPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
                {createForm.formState.errors.loanBorrowedAmount ? (
                  <Text style={styles.errorText}>
                    {resolveFormErrorText(createForm.formState.errors.loanBorrowedAmount.message, t)}
                  </Text>
                ) : null}

                <Text style={styles.fieldLabel}>{t('accounts.form.loanTotalRepayableLabel')}</Text>
                <Controller
                  control={createForm.control}
                  name="loanTotalRepayable"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!createAccountMutation.isPending}
                      keyboardType="numbers-and-punctuation"
                      placeholder={t('accounts.form.loanTotalRepayablePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
                {createForm.formState.errors.loanTotalRepayable ? (
                  <Text style={styles.errorText}>
                    {resolveFormErrorText(createForm.formState.errors.loanTotalRepayable.message, t)}
                  </Text>
                ) : null}

                <Text style={styles.fieldLabel}>{t('accounts.form.loanMonthlyPaymentLabel')}</Text>
                <Controller
                  control={createForm.control}
                  name="loanMonthlyPayment"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!createAccountMutation.isPending}
                      keyboardType="numbers-and-punctuation"
                      placeholder={t('accounts.form.loanMonthlyPaymentPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
                {createForm.formState.errors.loanMonthlyPayment ? (
                  <Text style={styles.errorText}>
                    {resolveFormErrorText(createForm.formState.errors.loanMonthlyPayment.message, t)}
                  </Text>
                ) : null}

                <Text style={styles.fieldLabel}>{t('accounts.form.loanInstallmentCountLabel')}</Text>
                <Controller
                  control={createForm.control}
                  name="loanInstallmentCount"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!createAccountMutation.isPending}
                      keyboardType="number-pad"
                      placeholder={t('accounts.form.loanInstallmentCountPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
                {createForm.formState.errors.loanInstallmentCount ? (
                  <Text style={styles.errorText}>
                    {resolveFormErrorText(createForm.formState.errors.loanInstallmentCount.message, t)}
                  </Text>
                ) : null}

                <Text style={styles.fieldLabel}>{t('accounts.form.loanPaymentDayLabel')}</Text>
                <Controller
                  control={createForm.control}
                  name="loanPaymentDay"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!createAccountMutation.isPending}
                      keyboardType="number-pad"
                      placeholder={t('accounts.form.loanPaymentDayPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
                {createForm.formState.errors.loanPaymentDay ? (
                  <Text style={styles.errorText}>
                    {resolveFormErrorText(createForm.formState.errors.loanPaymentDay.message, t)}
                  </Text>
                ) : null}

                <Text style={styles.fieldLabel}>{t('accounts.form.loanFirstPaymentDateLabel')}</Text>
                <Controller
                  control={createForm.control}
                  name="loanFirstPaymentDate"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!createAccountMutation.isPending}
                      placeholder={t('accounts.form.loanFirstPaymentDatePlaceholder')}
                      autoCapitalize="none"
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
                {createForm.formState.errors.loanFirstPaymentDate ? (
                  <Text style={styles.errorText}>
                    {resolveFormErrorText(createForm.formState.errors.loanFirstPaymentDate.message, t)}
                  </Text>
                ) : null}

                <Text style={styles.fieldLabel}>{t('accounts.form.loanPaymentAccountLabel')}</Text>
                <Controller
                  control={createForm.control}
                  name="loanPaymentAccountId"
                  render={({ field: { onChange, value } }) => (
                    <View style={styles.chipWrap}>
                      <Pressable onPress={() => onChange('')}>
                        <Chip
                          label={t('accounts.form.loanPaymentAccountOptional')}
                          tone={!value ? 'primary' : 'default'}
                        />
                      </Pressable>
                      {createLoanSourceAccounts.map((account) => (
                        <Pressable key={`create-loan-payment-${account.id}`} onPress={() => onChange(account.id)}>
                          <Chip label={account.name} tone={value === account.id ? 'primary' : 'default'} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                />

                <Text style={styles.fieldLabel}>{t('accounts.form.loanNoteLabel')}</Text>
                <Controller
                  control={createForm.control}
                  name="loanNote"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!createAccountMutation.isPending}
                      placeholder={t('accounts.form.loanNotePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>{t('accounts.form.openingBalanceLabel')}</Text>
                <Controller
                  control={createForm.control}
                  name="openingBalance"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!createAccountMutation.isPending}
                      placeholder={t('accounts.form.openingBalancePlaceholder')}
                      keyboardType="numbers-and-punctuation"
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                />
                {createForm.formState.errors.openingBalance ? (
                  <Text style={styles.errorText}>
                    {resolveFormErrorText(createForm.formState.errors.openingBalance.message, t)}
                  </Text>
                ) : null}
              </>
            )}

            <Text style={styles.helperText}>
              {createLooksLiability ? t('accounts.form.liabilityHint') : t('accounts.form.assetHint')}
            </Text>

            <PrimaryButton
              label={createAccountMutation.isPending ? t('accounts.form.creating') : t('accounts.form.create')}
              loading={createAccountMutation.isPending}
              disabled={createAccountMutation.isPending}
              onPress={createForm.handleSubmit(
                (values) => {
                  logLoanCreateDebug('submit_valid', {
                    accountType: values.type,
                    hasLoanSource: Boolean(values.loanPaymentAccountId?.trim()),
                    firstPaymentDateRaw: values.loanFirstPaymentDate ?? null,
                  });
                  createAccountMutation.mutate(values);
                },
                (errors) => {
                  logLoanCreateDebug('submit_invalid', {
                    accountType: createForm.getValues('type'),
                    fields: summarizeFormErrorsForDebug(
                      errors as Partial<Record<keyof CreateAccountFormValues, { message?: unknown }>>,
                    ),
                  });
                },
              )}
            />
          </Card>
        </Section>

        <Section
          title={t('accounts.sections.list.title')}
          subtitle={t('accounts.sections.list.total', { count: accounts.length })}
        >
          {accounts.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>{t('accounts.state.empty')}</Text>
            </Card>
          ) : null}

          {accounts.map((account) => {
            const accountBalance = toFiniteNumber(
              balanceByAccountId.get(account.id) ?? account.openingBalance ?? 0,
              0,
            );
            const loanStats = account.loanStats ?? null;
            const isLoan = account.type === 'loan';
            const remainingLoanBalance = isLoan
              ? toFiniteNumber(loanStats?.remainingBalance ?? accountBalance, accountBalance)
              : accountBalance;
            const paidInstallments = Math.max(0, Math.trunc(toFiniteNumber(loanStats?.paidInstallments ?? 0, 0)));
            const totalInstallments = Math.max(
              0,
              Math.trunc(toFiniteNumber(loanStats?.totalInstallments ?? account.loan?.installmentCount ?? 0, 0)),
            );
            const rawRemainingInstallments = toFiniteNumber(
              loanStats?.remainingInstallments ?? Number.NaN,
              Number.NaN,
            );
            const remainingInstallments = Number.isFinite(rawRemainingInstallments)
              ? Math.max(0, Math.trunc(rawRemainingInstallments))
              : Math.max(totalInstallments - paidInstallments, 0);
            const accountRoleLabel = isLiabilityAccountType(account.type)
              ? t('accounts.balance.liabilityTag')
              : account.type === 'debt_lent'
                ? t('accounts.balance.assetTag')
                : null;
            const isLoanActionOpen = loanActionState.accountId === account.id && loanActionState.mode !== null;
            const loanPaymentSourceAccounts = accounts.filter(
              (candidate) =>
                candidate.id !== account.id &&
                candidate.type !== 'loan' &&
                candidate.currency === account.currency,
            );

            return (
              <Card key={account.id} style={styles.accountCard}>
                <View style={styles.accountHeader}>
                  <View style={styles.accountMeta}>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountSub}>{`${getAccountTypeLabel(account.type, t, account.name)} · ${account.currency}`}</Text>
                    <Text
                      style={[
                        styles.accountBalance,
                        (isLoan ? remainingLoanBalance : accountBalance) > 0
                          ? styles.accountBalancePositive
                          : (isLoan ? remainingLoanBalance : accountBalance) < 0
                            ? styles.accountBalanceNegative
                            : styles.accountBalanceNeutral,
                      ]}
                    >
                      {t(isLoan ? 'accounts.loan.remainingBalance' : 'accounts.balance.value', {
                        value: formatSignedBalance(
                          isLoan ? remainingLoanBalance : accountBalance,
                          account.currency,
                          locale,
                        ),
                      })}
                    </Text>
                    {accountRoleLabel ? <Text style={styles.accountRole}>{accountRoleLabel}</Text> : null}

                    {isLoan && account.loan ? (
                      <View style={styles.loanMetaWrap}>
                        <Text style={styles.loanMetaText}>
                          {t('accounts.loan.borrowedAmount', {
                            value: formatAbsoluteMoney(account.loan.borrowedAmount, account.currency, locale),
                          })}
                        </Text>
                        <Text style={styles.loanMetaText}>
                          {t('accounts.loan.totalRepayable', {
                            value: formatAbsoluteMoney(account.loan.totalRepayable, account.currency, locale),
                          })}
                        </Text>
                        <Text style={styles.loanMetaText}>
                          {t('accounts.loan.monthlyPayment', {
                            value: formatAbsoluteMoney(account.loan.monthlyPayment, account.currency, locale),
                          })}
                        </Text>
                        <Text style={styles.loanMetaText}>
                          {t('accounts.loan.installmentProgress', {
                            current: Math.min(paidInstallments, totalInstallments),
                            total: totalInstallments,
                          })}
                        </Text>
                        <Text style={styles.loanMetaText}>
                          {t('accounts.loan.remainingInstallments', { count: remainingInstallments })}
                        </Text>
                        <Text style={styles.loanMetaText}>
                          {t('accounts.loan.nextPaymentDate', {
                            date: formatDateLabel(loanStats?.nextPaymentDate, locale),
                          })}
                        </Text>
                        <Text style={styles.loanMetaText}>
                          {t('accounts.loan.statusLabel', {
                            status: getLoanStatusLabel(account.loan.status, t),
                          })}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.accountActions}>
                    <Pressable
                      disabled={
                        updateAccountMutation.isPending ||
                        deleteAccountMutation.isPending ||
                        loanActionMutation.isPending
                      }
                      onPress={() => {
                        setEditingAccountId(account.id);
                        editForm.reset({
                          name: account.name,
                          type: account.type,
                          openingBalance: String(account.openingBalance ?? 0),
                          loanBorrowedAmount: account.loan ? String(account.loan.borrowedAmount) : '',
                          loanTotalRepayable: account.loan ? String(account.loan.totalRepayable) : '',
                          loanMonthlyPayment: account.loan ? String(account.loan.monthlyPayment) : '',
                          loanInstallmentCount: account.loan ? String(account.loan.installmentCount) : '',
                          loanPaymentDay: account.loan ? String(account.loan.paymentDay) : '',
                          loanFirstPaymentDate: account.loan
                            ? toDateInputValue(account.loan.firstPaymentDate)
                            : toDateInputValue(new Date().toISOString()),
                          loanPaymentAccountId: account.loan?.paymentAccountId ?? '',
                          loanNote: account.loan?.note ?? '',
                        });
                      }}
                    >
                      <Text
                        style={[
                          styles.linkText,
                          updateAccountMutation.isPending ||
                          deleteAccountMutation.isPending ||
                          loanActionMutation.isPending
                            ? styles.disabledLinkText
                            : null,
                        ]}
                      >
                        {t('common.edit')}
                      </Text>
                    </Pressable>

                    <Pressable
                      disabled={
                        updateAccountMutation.isPending ||
                        deleteAccountMutation.isPending ||
                        loanActionMutation.isPending
                      }
                      onPress={() => {
                        confirmDeleteAccount(account.id, account.name);
                      }}
                    >
                      <Text
                        style={[
                          styles.deleteLinkText,
                          updateAccountMutation.isPending ||
                          deleteAccountMutation.isPending ||
                          loanActionMutation.isPending
                            ? styles.disabledLinkText
                            : null,
                        ]}
                      >
                        {t('common.delete')}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {isLoan && account.loan?.status === 'active' ? (
                  <View style={styles.loanActionsWrap}>
                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() => {
                        openLoanAction(account, 'payment', account.loan?.monthlyPayment ?? 0);
                      }}
                      disabled={loanActionMutation.isPending || updateAccountMutation.isPending}
                    >
                      <Text style={styles.linkText}>{t('accounts.loan.paymentAction')}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() => {
                        openLoanAction(account, 'earlyPayoff', Math.abs(remainingLoanBalance));
                      }}
                      disabled={loanActionMutation.isPending || updateAccountMutation.isPending}
                    >
                      <Text style={styles.deleteLinkText}>{t('accounts.loan.earlyPayoffAction')}</Text>
                    </Pressable>
                  </View>
                ) : null}

                {isLoanActionOpen ? (
                  <View style={styles.inlineEditor}>
                    <Text style={styles.fieldLabel}>{t('accounts.loan.actionFromAccount')}</Text>
                    {loanPaymentSourceAccounts.length === 0 ? (
                      <Text style={styles.errorText}>{t('accounts.loan.actionNoSourceAccount')}</Text>
                    ) : (
                      <View style={styles.chipWrap}>
                        {loanPaymentSourceAccounts.map((candidate) => (
                          <Pressable
                            key={`loan-action-source-${account.id}-${candidate.id}`}
                            onPress={() =>
                              setLoanActionState((current) => ({
                                ...current,
                                fromAccountId: candidate.id,
                              }))
                            }
                          >
                            <Chip
                              label={candidate.name}
                              tone={loanActionState.fromAccountId === candidate.id ? 'primary' : 'default'}
                            />
                          </Pressable>
                        ))}
                      </View>
                    )}

                    <Text style={styles.fieldLabel}>{t('accounts.loan.actionAmount')}</Text>
                    <TextInput
                      style={styles.input}
                      value={loanActionState.amount}
                      onChangeText={(next) =>
                        setLoanActionState((current) => ({
                          ...current,
                          amount: next,
                        }))
                      }
                      keyboardType="numbers-and-punctuation"
                      placeholder={t('accounts.form.loanMonthlyPaymentPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />

                    <Text style={styles.fieldLabel}>{t('accounts.loan.actionDate')}</Text>
                    <TextInput
                      style={styles.input}
                      value={loanActionState.occurredAt}
                      onChangeText={(next) =>
                        setLoanActionState((current) => ({
                          ...current,
                          occurredAt: next,
                        }))
                      }
                      autoCapitalize="none"
                      placeholder={t('accounts.loan.actionDatePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />

                    <Text style={styles.fieldLabel}>{t('accounts.loan.actionNote')}</Text>
                    <TextInput
                      style={styles.input}
                      value={loanActionState.note}
                      onChangeText={(next) =>
                        setLoanActionState((current) => ({
                          ...current,
                          note: next,
                        }))
                      }
                      placeholder={t('accounts.form.loanNotePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                    />

                    <View style={styles.editorActions}>
                      <PrimaryButton
                        label={
                          loanActionMutation.isPending
                            ? t('common.saving')
                            : loanActionState.mode === 'payment'
                              ? t('accounts.loan.actionSubmitPayment')
                              : t('accounts.loan.actionSubmitEarlyPayoff')
                        }
                        loading={loanActionMutation.isPending}
                        disabled={loanActionMutation.isPending}
                        onPress={() => {
                          if (!loanActionState.accountId || !loanActionState.mode) {
                            return;
                          }

                          if (!loanActionState.fromAccountId) {
                            showAlert(t('common.error'), t('errors.validation.selectSourceAccount'));
                            return;
                          }

                          const amount = parsePositiveAmount(loanActionState.amount);
                          if (amount === null) {
                            showAlert(t('common.error'), t('errors.validation.amountPositive'));
                            return;
                          }

                          const occurredAt = loanActionState.occurredAt.trim()
                            ? normalizeDateTimeInput(loanActionState.occurredAt)
                            : null;
                          if (loanActionState.occurredAt.trim() && !occurredAt) {
                            showAlert(t('common.error'), t('errors.validation.invalidIsoDateTime'));
                            return;
                          }

                          loanActionMutation.mutate({
                            mode: loanActionState.mode,
                            accountId: loanActionState.accountId,
                            fromAccountId: loanActionState.fromAccountId,
                            amount,
                            occurredAt: occurredAt ?? undefined,
                            note: loanActionState.note.trim() || undefined,
                          });
                        }}
                      />

                      <Pressable
                        style={styles.secondaryAction}
                        onPress={() => setLoanActionState(initialLoanActionState())}
                        disabled={loanActionMutation.isPending}
                      >
                        <Text style={styles.secondaryActionText}>{t('common.cancel')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {editingAccountId === account.id && editingAccount ? (
                  <View style={styles.inlineEditor}>
                    <Text style={styles.fieldLabel}>{t('accounts.form.nameLabel')}</Text>
                    <Controller
                      control={editForm.control}
                      name="name"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          style={styles.input}
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                          placeholder={t('accounts.form.namePlaceholder')}
                          placeholderTextColor={colors.textMuted}
                        />
                      )}
                    />
                    {editForm.formState.errors.name ? (
                      <Text style={styles.errorText}>
                        {resolveFormErrorText(editForm.formState.errors.name.message, t)}
                      </Text>
                    ) : null}

                    <Text style={styles.fieldLabel}>{t('accounts.form.typeLabel')}</Text>
                    <Controller
                      control={editForm.control}
                      name="type"
                      render={({ field: { onChange, value } }) => (
                        <TypePicker
                          selected={value}
                          onSelect={onChange}
                          disabled={
                            updateAccountMutation.isPending ||
                            deleteAccountMutation.isPending ||
                            account.type === 'loan'
                          }
                        />
                      )}
                    />
                    {account.type === 'loan' ? (
                      <Text style={styles.helperText}>{t('accounts.form.loanTypeLockedHint')}</Text>
                    ) : null}

                    {editIsLoan ? (
                      <>
                        <Text style={styles.fieldLabel}>{t('accounts.form.loanBorrowedAmountLabel')}</Text>
                        <Controller
                          control={editForm.control}
                          name="loanBorrowedAmount"
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                              keyboardType="numbers-and-punctuation"
                              placeholder={t('accounts.form.loanBorrowedAmountPlaceholder')}
                              placeholderTextColor={colors.textMuted}
                            />
                          )}
                        />
                        {editForm.formState.errors.loanBorrowedAmount ? (
                          <Text style={styles.errorText}>
                            {resolveFormErrorText(editForm.formState.errors.loanBorrowedAmount.message, t)}
                          </Text>
                        ) : null}

                        <Text style={styles.fieldLabel}>{t('accounts.form.loanTotalRepayableLabel')}</Text>
                        <Controller
                          control={editForm.control}
                          name="loanTotalRepayable"
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                              keyboardType="numbers-and-punctuation"
                              placeholder={t('accounts.form.loanTotalRepayablePlaceholder')}
                              placeholderTextColor={colors.textMuted}
                            />
                          )}
                        />
                        {editForm.formState.errors.loanTotalRepayable ? (
                          <Text style={styles.errorText}>
                            {resolveFormErrorText(editForm.formState.errors.loanTotalRepayable.message, t)}
                          </Text>
                        ) : null}

                        <Text style={styles.fieldLabel}>{t('accounts.form.loanMonthlyPaymentLabel')}</Text>
                        <Controller
                          control={editForm.control}
                          name="loanMonthlyPayment"
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                              keyboardType="numbers-and-punctuation"
                              placeholder={t('accounts.form.loanMonthlyPaymentPlaceholder')}
                              placeholderTextColor={colors.textMuted}
                            />
                          )}
                        />
                        {editForm.formState.errors.loanMonthlyPayment ? (
                          <Text style={styles.errorText}>
                            {resolveFormErrorText(editForm.formState.errors.loanMonthlyPayment.message, t)}
                          </Text>
                        ) : null}

                        <Text style={styles.fieldLabel}>{t('accounts.form.loanInstallmentCountLabel')}</Text>
                        <Controller
                          control={editForm.control}
                          name="loanInstallmentCount"
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                              keyboardType="number-pad"
                              placeholder={t('accounts.form.loanInstallmentCountPlaceholder')}
                              placeholderTextColor={colors.textMuted}
                            />
                          )}
                        />
                        {editForm.formState.errors.loanInstallmentCount ? (
                          <Text style={styles.errorText}>
                            {resolveFormErrorText(editForm.formState.errors.loanInstallmentCount.message, t)}
                          </Text>
                        ) : null}

                        <Text style={styles.fieldLabel}>{t('accounts.form.loanPaymentDayLabel')}</Text>
                        <Controller
                          control={editForm.control}
                          name="loanPaymentDay"
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                              keyboardType="number-pad"
                              placeholder={t('accounts.form.loanPaymentDayPlaceholder')}
                              placeholderTextColor={colors.textMuted}
                            />
                          )}
                        />
                        {editForm.formState.errors.loanPaymentDay ? (
                          <Text style={styles.errorText}>
                            {resolveFormErrorText(editForm.formState.errors.loanPaymentDay.message, t)}
                          </Text>
                        ) : null}

                        <Text style={styles.fieldLabel}>{t('accounts.form.loanFirstPaymentDateLabel')}</Text>
                        <Controller
                          control={editForm.control}
                          name="loanFirstPaymentDate"
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                              placeholder={t('accounts.form.loanFirstPaymentDatePlaceholder')}
                              autoCapitalize="none"
                              placeholderTextColor={colors.textMuted}
                            />
                          )}
                        />
                        {editForm.formState.errors.loanFirstPaymentDate ? (
                          <Text style={styles.errorText}>
                            {resolveFormErrorText(editForm.formState.errors.loanFirstPaymentDate.message, t)}
                          </Text>
                        ) : null}

                        <Text style={styles.fieldLabel}>{t('accounts.form.loanPaymentAccountLabel')}</Text>
                        <Controller
                          control={editForm.control}
                          name="loanPaymentAccountId"
                          render={({ field: { onChange, value } }) => (
                            <View style={styles.chipWrap}>
                              <Pressable onPress={() => onChange('')}>
                                <Chip
                                  label={t('accounts.form.loanPaymentAccountOptional')}
                                  tone={!value ? 'primary' : 'default'}
                                />
                              </Pressable>
                              {accounts
                                .filter(
                                  (candidate) =>
                                    candidate.type !== 'loan' &&
                                    candidate.currency === account.currency &&
                                    candidate.id !== account.id,
                                )
                                .map((candidate) => (
                                  <Pressable
                                    key={`edit-loan-payment-${account.id}-${candidate.id}`}
                                    onPress={() => onChange(candidate.id)}
                                  >
                                    <Chip
                                      label={candidate.name}
                                      tone={value === candidate.id ? 'primary' : 'default'}
                                    />
                                  </Pressable>
                                ))}
                            </View>
                          )}
                        />

                        <Text style={styles.fieldLabel}>{t('accounts.form.loanNoteLabel')}</Text>
                        <Controller
                          control={editForm.control}
                          name="loanNote"
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                              placeholder={t('accounts.form.loanNotePlaceholder')}
                              placeholderTextColor={colors.textMuted}
                            />
                          )}
                        />
                      </>
                    ) : (
                      <>
                        <Text style={styles.fieldLabel}>{t('accounts.form.openingBalanceLabel')}</Text>
                        <Controller
                          control={editForm.control}
                          name="openingBalance"
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              editable={!updateAccountMutation.isPending && !deleteAccountMutation.isPending}
                              placeholder={t('accounts.form.openingBalancePlaceholder')}
                              keyboardType="numbers-and-punctuation"
                              placeholderTextColor={colors.textMuted}
                            />
                          )}
                        />
                        {editForm.formState.errors.openingBalance ? (
                          <Text style={styles.errorText}>
                            {resolveFormErrorText(editForm.formState.errors.openingBalance.message, t)}
                          </Text>
                        ) : null}
                      </>
                    )}

                    <Text style={styles.helperText}>
                      {editLooksLiability ? t('accounts.form.liabilityHint') : t('accounts.form.assetHint')}
                    </Text>

                    <View style={styles.editorActions}>
                      <PrimaryButton
                        label={updateAccountMutation.isPending ? t('common.saving') : t('common.save')}
                        loading={updateAccountMutation.isPending}
                        disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                        onPress={editForm.handleSubmit((values) => {
                          updateAccountMutation.mutate({ id: editingAccount.id, values });
                        })}
                      />
                      <Pressable
                        disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                        style={styles.secondaryAction}
                        onPress={() => {
                          setEditingAccountId(null);
                        }}
                      >
                        <Text style={styles.secondaryActionText}>{t('common.cancel')}</Text>
                      </Pressable>

                      <Pressable
                        disabled={updateAccountMutation.isPending || deleteAccountMutation.isPending}
                        style={styles.secondaryAction}
                        onPress={() => {
                          confirmDeleteAccount(editingAccount.id, editingAccount.name);
                        }}
                      >
                        <Text style={styles.deleteLinkText}>{t('common.delete')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })}
        </Section>
      </ScreenContainer>

      {feedback ? (
        <View
          pointerEvents="none"
          style={[
            styles.feedbackOverlay,
            { top: Math.max(insets.top + spacing.xs, spacing.md) },
          ]}
        >
          <Card
            style={[
              styles.feedbackCard,
              feedback.tone === 'success' ? styles.feedbackSuccess : styles.feedbackError,
            ]}
          >
            <Text style={styles.feedbackText}>{feedback.message}</Text>
          </Card>
        </View>
      ) : null}
    </View>
  );
}

function TypePicker({
  selected,
  onSelect,
  disabled = false,
}: {
  selected: AccountType;
  onSelect: (value: AccountType) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <View style={styles.chipWrap}>
      {accountTypes.map((type) => (
        <Pressable
          key={type}
          disabled={disabled}
          onPress={() => onSelect(type)}
          style={disabled ? styles.disabledPressable : null}
        >
          <Chip label={getAccountTypeLabel(type, t)} tone={selected === type ? 'primary' : 'default'} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  screenContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  stateText: {
    ...typography.body,
    color: colors.textMuted,
  },
  formCard: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 0,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  disabledPressable: {
    opacity: 0.6,
  },
  accountCard: {
    gap: spacing.sm,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  accountMeta: {
    flex: 1,
    gap: spacing.xxs,
  },
  accountName: {
    ...typography.subheading,
    color: colors.text,
  },
  accountSub: {
    ...typography.caption,
    color: colors.textMuted,
  },
  accountBalance: {
    ...typography.subheading,
    fontSize: 14,
  },
  accountBalancePositive: {
    color: colors.income,
  },
  accountBalanceNegative: {
    color: colors.expense,
  },
  accountBalanceNeutral: {
    color: colors.textMuted,
  },
  accountRole: {
    ...typography.caption,
    color: colors.textMuted,
  },
  loanMetaWrap: {
    marginTop: spacing.xxs,
    gap: 2,
  },
  loanMetaText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  loanActionsWrap: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  linkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  deleteLinkText: {
    ...typography.caption,
    color: colors.expense,
    fontWeight: '600',
  },
  disabledLinkText: {
    opacity: 0.45,
  },
  accountActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  inlineEditor: {
    gap: spacing.sm,
  },
  editorActions: {
    gap: spacing.xs,
  },
  secondaryAction: {
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  secondaryActionText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  baseCurrencyText: {
    ...typography.body,
    color: colors.text,
  },
  sessionCard: {
    gap: spacing.xs,
  },
  feedbackCard: {
    borderWidth: 1,
    width: '100%',
  },
  feedbackSuccess: {
    borderColor: '#17B26A',
    backgroundColor: '#EAF9F0',
  },
  feedbackError: {
    borderColor: '#F04438',
    backgroundColor: '#FDECEC',
  },
  feedbackText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  feedbackOverlay: {
    alignItems: 'center',
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    zIndex: 9,
  },
  errorCard: {
    gap: spacing.sm,
  },
  errorTitle: {
    ...typography.subheading,
    color: colors.text,
  },
  errorText: {
    ...typography.caption,
    color: colors.expense,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
