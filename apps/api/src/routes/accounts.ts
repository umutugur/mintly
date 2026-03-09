import {
  accountCreateInputSchema,
  accountListResponseSchema,
  accountLoanStatsSchema,
  accountSchema,
  accountUpdateInputSchema,
  loanEarlyPayoffInputSchema,
  loanEarlyPayoffResponseSchema,
  loanPaymentInputSchema,
  loanPaymentResponseSchema,
  logoutResponseSchema,
  type Account,
  type AccountCreateInput,
  type AccountLoanCreateInput,
  type AccountLoanStats,
  type AccountUpdateInput,
  type LoanEarlyPayoffInput,
  type LoanPaymentInput,
} from '@mintly/shared';
import type { FastifyInstance } from 'fastify';
import type { Types } from 'mongoose';
import { z } from 'zod';

import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { createTransferPair, resolveActiveAccount } from '../lib/ledger.js';
import { AccountModel, type AccountDocument } from '../models/Account.js';
import { RecurringRuleModel } from '../models/RecurringRule.js';
import { TransactionModel } from '../models/Transaction.js';
import { UpcomingPaymentModel } from '../models/UpcomingPayment.js';
import { UserModel } from '../models/User.js';

import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';

const accountListQuerySchema = z.object({
  includeDeleted: z.coerce.boolean().default(false),
});

interface LoanInstallmentRuleSummary {
  id: string;
  installmentIndex: number;
  nextRunAt: Date;
}

function toIsoDate(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.toISOString();
}

function extractLoanFromAccount(account: AccountDocument): Account['loan'] {
  const raw = (account as AccountDocument & {
    loan?: {
      borrowedAmount?: number;
      totalRepayable?: number;
      monthlyPayment?: number;
      installmentCount?: number;
      paymentDay?: number;
      firstPaymentDate?: Date;
      paymentAccountId?: Types.ObjectId | null;
      note?: string | null;
      status?: 'active' | 'closed' | 'closed_early';
      closedAt?: Date | null;
    } | null;
  }).loan;

  if (!raw) {
    return null;
  }

  return {
    borrowedAmount: raw.borrowedAmount ?? 0,
    totalRepayable: raw.totalRepayable ?? 0,
    monthlyPayment: raw.monthlyPayment ?? 0,
    installmentCount: raw.installmentCount ?? 0,
    paymentDay: raw.paymentDay ?? 1,
    firstPaymentDate: raw.firstPaymentDate ? raw.firstPaymentDate.toISOString() : new Date().toISOString(),
    paymentAccountId: raw.paymentAccountId ? raw.paymentAccountId.toString() : null,
    note: raw.note ?? null,
    status: raw.status ?? 'active',
    closedAt: raw.closedAt ? raw.closedAt.toISOString() : null,
  };
}

function toAccountDto(account: AccountDocument, loanStatsById?: Map<string, AccountLoanStats>): Account {
  const stamped = account as AccountDocument & { createdAt: Date; updatedAt: Date };
  const loanStats = loanStatsById?.get(account.id) ?? null;

  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    openingBalance: typeof account.openingBalance === 'number' ? account.openingBalance : 0,
    loan: extractLoanFromAccount(account),
    loanStats: loanStats ? accountLoanStatsSchema.parse(loanStats) : null,
    createdAt: stamped.createdAt.toISOString(),
    updatedAt: stamped.updatedAt.toISOString(),
  };
}

async function enforceBaseCurrency(userId: Types.ObjectId, inputCurrency: string): Promise<void> {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'User not found',
      statusCode: 401,
    });
  }

  if (!user.baseCurrency) {
    user.baseCurrency = inputCurrency;
    await user.save();
    return;
  }

  if (user.baseCurrency !== inputCurrency) {
    throw new ApiError({
      code: 'BASE_CURRENCY_MISMATCH',
      message: 'Account currency must match your base currency',
      statusCode: 400,
    });
  }
}

function normalizeLoanCreateInput(input: AccountLoanCreateInput): {
  borrowedAmount: number;
  totalRepayable: number;
  monthlyPayment: number;
  installmentCount: number;
  paymentDay: number;
  firstPaymentDate: Date;
  paymentAccountId: Types.ObjectId | null;
  note: string | null;
} {
  const firstPaymentDate = new Date(input.firstPaymentDate);
  if (Number.isNaN(firstPaymentDate.getTime())) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid first payment date',
      statusCode: 400,
    });
  }

  return {
    borrowedAmount: input.borrowedAmount,
    totalRepayable: input.totalRepayable,
    monthlyPayment: input.monthlyPayment,
    installmentCount: input.installmentCount,
    paymentDay: input.paymentDay,
    firstPaymentDate,
    paymentAccountId: input.paymentAccountId ? parseObjectId(input.paymentAccountId, 'paymentAccountId') : null,
    note: input.note?.trim() ? input.note.trim() : null,
  };
}

function toMonthlyInstallmentDate(
  firstPaymentDate: Date,
  paymentDay: number,
  installmentIndex: number,
): Date {
  const base = new Date(firstPaymentDate);
  return new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth() + (installmentIndex - 1),
      paymentDay,
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
      base.getUTCMilliseconds(),
    ),
  );
}

function resolveInstallmentAmount(params: {
  installmentIndex: number;
  installmentCount: number;
  monthlyPayment: number;
  totalRepayable: number;
}): number {
  if (params.installmentIndex < params.installmentCount) {
    return params.monthlyPayment;
  }

  const consumed = params.monthlyPayment * (params.installmentCount - 1);
  const lastAmount = params.totalRepayable - consumed;
  if (lastAmount > 0) {
    return lastAmount;
  }

  return params.monthlyPayment;
}

async function ensurePaymentAccount(params: {
  userId: Types.ObjectId;
  paymentAccountId: Types.ObjectId | null;
  currency: string;
}): Promise<Types.ObjectId | null> {
  if (!params.paymentAccountId) {
    return null;
  }

  const paymentAccount = await resolveActiveAccount(params.userId, params.paymentAccountId);
  if (paymentAccount.currency !== params.currency) {
    throw new ApiError({
      code: 'TRANSFER_CURRENCY_MISMATCH',
      message: 'Loan and payment accounts must have matching currencies',
      statusCode: 400,
    });
  }

  return paymentAccount._id;
}

async function createLoanInstallmentSchedule(params: {
  userId: Types.ObjectId;
  account: AccountDocument;
  loan: {
    installmentCount: number;
    paymentDay: number;
    firstPaymentDate: Date;
    monthlyPayment: number;
    totalRepayable: number;
    paymentAccountId: Types.ObjectId | null;
  };
}): Promise<void> {
  const recurringDocs = Array.from({ length: params.loan.installmentCount }, (_, index) => {
    const installmentIndex = index + 1;
    const dueDate = toMonthlyInstallmentDate(
      params.loan.firstPaymentDate,
      params.loan.paymentDay,
      installmentIndex,
    );
    const amount = resolveInstallmentAmount({
      installmentIndex,
      installmentCount: params.loan.installmentCount,
      monthlyPayment: params.loan.monthlyPayment,
      totalRepayable: params.loan.totalRepayable,
    });

    return {
      userId: params.userId,
      kind: 'transfer' as const,
      accountId: null,
      categoryId: null,
      categoryKey: null,
      type: null,
      fromAccountId: params.loan.paymentAccountId,
      toAccountId: params.account._id,
      amount,
      description: `${params.account.name} installment ${installmentIndex}/${params.loan.installmentCount}`,
      cadence: 'monthly' as const,
      dayOfWeek: null,
      dayOfMonth: params.loan.paymentDay,
      startAt: dueDate,
      endAt: dueDate,
      nextRunAt: dueDate,
      lastRunAt: null,
      isPaused: true,
      relatedLoanAccountId: params.account._id,
      installmentIndex,
      installmentCount: params.loan.installmentCount,
      paymentDay: params.loan.paymentDay,
      installmentStatus: 'scheduled' as const,
      deletedAt: null,
    };
  });

  const createdRules = await RecurringRuleModel.insertMany(recurringDocs, { ordered: true });
  if (createdRules.length === 0) {
    return;
  }

  await UpcomingPaymentModel.insertMany(
    createdRules.map((rule) => ({
      userId: params.userId,
      title: params.account.name,
      type: 'debt' as const,
      amount: rule.amount,
      currency: params.account.currency,
      dueDate: rule.nextRunAt,
      status: 'upcoming' as const,
      source: 'template' as const,
      linkedTransactionId: null,
      recurringTemplateId: rule._id,
      meta: {
        relatedLoanAccountId: params.account._id,
        installmentIndex: rule.installmentIndex,
        installmentCount: rule.installmentCount,
        remainingInstallments:
          (rule.installmentCount ?? params.loan.installmentCount) -
          (rule.installmentIndex ?? 1) +
          1,
        paymentDay: rule.paymentDay,
      },
    })),
    { ordered: true },
  );
}

async function refreshLoanUpcomingRemainingInstallments(params: {
  userId: Types.ObjectId;
  loanAccountId: Types.ObjectId;
}): Promise<void> {
  const upcomingItems = await UpcomingPaymentModel.find({
    userId: params.userId,
    status: 'upcoming',
    'meta.relatedLoanAccountId': params.loanAccountId,
  })
    .sort({ 'meta.installmentIndex': 1, dueDate: 1, _id: 1 })
    .select('_id meta');

  for (let index = 0; index < upcomingItems.length; index += 1) {
    const item = upcomingItems[index];
    const remainingInstallments = upcomingItems.length - index;
    const currentRemaining = item.meta?.remainingInstallments ?? null;
    if (currentRemaining !== remainingInstallments) {
      await UpcomingPaymentModel.updateOne(
        { _id: item._id },
        {
          $set: {
            'meta.remainingInstallments': remainingInstallments,
          },
        },
      );
    }
  }
}

async function calculateAccountCurrentBalance(params: {
  userId: Types.ObjectId;
  account: AccountDocument;
}): Promise<number> {
  const rows = await TransactionModel.aggregate<{
    income: number;
    expense: number;
  }>([
    {
      $match: {
        userId: params.userId,
        accountId: params.account._id,
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: null,
        income: {
          $sum: {
            $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0],
          },
        },
        expense: {
          $sum: {
            $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0],
          },
        },
      },
    },
  ]);

  const net = (rows[0]?.income ?? 0) - (rows[0]?.expense ?? 0);
  return (params.account.openingBalance ?? 0) + net;
}

async function cancelFutureLoanInstallments(params: {
  userId: Types.ObjectId;
  loanAccountId: Types.ObjectId;
}): Promise<number> {
  const scheduledRules = await RecurringRuleModel.find({
    userId: params.userId,
    relatedLoanAccountId: params.loanAccountId,
    deletedAt: null,
    installmentStatus: 'scheduled',
  }).select('_id');

  if (scheduledRules.length === 0) {
    return 0;
  }

  const ruleIds = scheduledRules.map((rule) => rule._id);

  await Promise.all([
    RecurringRuleModel.updateMany(
      { _id: { $in: ruleIds } },
      {
        $set: {
          installmentStatus: 'cancelled',
          isPaused: true,
        },
      },
    ),
    UpcomingPaymentModel.updateMany(
      {
        userId: params.userId,
        recurringTemplateId: { $in: ruleIds },
        status: 'upcoming',
      },
      {
        $set: {
          status: 'cancelled',
        },
      },
    ),
  ]);

  await refreshLoanUpcomingRemainingInstallments({
    userId: params.userId,
    loanAccountId: params.loanAccountId,
  });

  return scheduledRules.length;
}

async function markNextLoanInstallmentPaid(params: {
  userId: Types.ObjectId;
  loanAccountId: Types.ObjectId;
  fromAccountId: Types.ObjectId;
  occurredAt: Date;
  linkedTransactionId: Types.ObjectId;
}): Promise<void> {
  const nextRule = await RecurringRuleModel.findOne({
    userId: params.userId,
    relatedLoanAccountId: params.loanAccountId,
    deletedAt: null,
    installmentStatus: 'scheduled',
  }).sort({ installmentIndex: 1, nextRunAt: 1, _id: 1 });

  if (!nextRule) {
    return;
  }

  nextRule.installmentStatus = 'paid';
  nextRule.isPaused = true;
  nextRule.lastRunAt = params.occurredAt;
  if (!nextRule.fromAccountId) {
    nextRule.fromAccountId = params.fromAccountId;
  }
  await nextRule.save();

  const upcoming = await UpcomingPaymentModel.findOne({
    userId: params.userId,
    recurringTemplateId: nextRule._id,
    status: 'upcoming',
  }).sort({ dueDate: 1, _id: 1 });

  if (upcoming) {
    upcoming.status = 'paid';
    upcoming.linkedTransactionId = params.linkedTransactionId;
    await upcoming.save();
  }

  await refreshLoanUpcomingRemainingInstallments({
    userId: params.userId,
    loanAccountId: params.loanAccountId,
  });
}

function getLoanInstallmentRulesByAccountId(
  rules: Array<{
    relatedLoanAccountId: Types.ObjectId | null;
    installmentStatus?: 'scheduled' | 'paid' | 'cancelled' | null;
    installmentCount?: number | null;
    nextRunAt: Date;
  }>,
): Map<string, AccountLoanStats> {
  const grouped = new Map<string, Array<(typeof rules)[number]>>();

  for (const rule of rules) {
    const loanId = rule.relatedLoanAccountId?.toString();
    if (!loanId) {
      continue;
    }

    const list = grouped.get(loanId) ?? [];
    list.push(rule);
    grouped.set(loanId, list);
  }

  const result = new Map<string, AccountLoanStats>();
  for (const [loanId, list] of grouped.entries()) {
    const paidInstallments = list.filter((item) => item.installmentStatus === 'paid').length;
    const remainingInstallments = list.filter((item) => item.installmentStatus === 'scheduled').length;
    const totalInstallments = list.reduce((max, item) => Math.max(max, item.installmentCount ?? 0), 0);
    const nextScheduled = list
      .filter((item) => item.installmentStatus === 'scheduled')
      .sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime())[0];

    result.set(loanId, {
      remainingBalance: 0,
      paidInstallments,
      remainingInstallments,
      totalInstallments,
      nextPaymentDate: toIsoDate(nextScheduled?.nextRunAt) ?? null,
    });
  }

  return result;
}

async function buildLoanStatsByAccountId(
  userId: Types.ObjectId,
  accounts: AccountDocument[],
): Promise<Map<string, AccountLoanStats>> {
  const loanAccounts = accounts.filter((account) => account.type === 'loan');
  if (loanAccounts.length === 0) {
    return new Map<string, AccountLoanStats>();
  }

  const loanAccountIds = loanAccounts.map((account) => account._id);
  const [balanceRows, installmentRules] = await Promise.all([
    TransactionModel.aggregate<{
      _id: Types.ObjectId;
      income: number;
      expense: number;
    }>([
      {
        $match: {
          userId,
          deletedAt: null,
          accountId: { $in: loanAccountIds },
        },
      },
      {
        $group: {
          _id: '$accountId',
          income: {
            $sum: {
              $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0],
            },
          },
          expense: {
            $sum: {
              $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0],
            },
          },
        },
      },
    ]),
    RecurringRuleModel.find({
      userId,
      relatedLoanAccountId: { $in: loanAccountIds },
      deletedAt: null,
    }).select('relatedLoanAccountId installmentStatus installmentCount nextRunAt'),
  ]);

  const netByAccountId = new Map(
    balanceRows.map((row) => [row._id.toString(), (row.income ?? 0) - (row.expense ?? 0)]),
  );
  const statsByLoanId = getLoanInstallmentRulesByAccountId(
    installmentRules.map((rule) => ({
      relatedLoanAccountId: rule.relatedLoanAccountId ?? null,
      installmentStatus: rule.installmentStatus ?? null,
      installmentCount: rule.installmentCount ?? null,
      nextRunAt: rule.nextRunAt,
    })),
  );

  for (const account of loanAccounts) {
    const current = statsByLoanId.get(account.id) ?? {
      remainingBalance: 0,
      paidInstallments: 0,
      remainingInstallments: 0,
      totalInstallments: 0,
      nextPaymentDate: null,
    };
    const fallbackTotalInstallments = account.loan?.installmentCount ?? 0;
    statsByLoanId.set(account.id, {
      ...current,
      totalInstallments: current.totalInstallments || fallbackTotalInstallments,
      remainingBalance: (account.openingBalance ?? 0) + (netByAccountId.get(account.id) ?? 0),
    });
  }

  return statsByLoanId;
}

export function registerAccountRoutes(app: FastifyInstance): void {
  app.get('/accounts', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const query = parseQuery(accountListQuerySchema, request.query);

    const filter = query.includeDeleted ? { userId } : { userId, deletedAt: null };
    const accounts = await AccountModel.find(filter).sort({ createdAt: -1 });
    const loanStatsById = await buildLoanStatsByAccountId(userId, accounts);

    return accountListResponseSchema.parse({
      accounts: accounts.map((account) => toAccountDto(account, loanStatsById)),
    });
  });

  app.post('/accounts', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const input = parseBody<AccountCreateInput>(accountCreateInputSchema, request.body);

    await enforceBaseCurrency(userId, input.currency);

    const loanInput = input.loan ? normalizeLoanCreateInput(input.loan) : null;
    const paymentAccountId = loanInput
      ? await ensurePaymentAccount({
          userId,
          paymentAccountId: loanInput.paymentAccountId,
          currency: input.currency,
        })
      : null;

    const openingBalance = input.type === 'loan' && loanInput
      ? (paymentAccountId ? (loanInput.borrowedAmount - loanInput.totalRepayable) : -loanInput.totalRepayable)
      : (input.openingBalance ?? 0);

    const account = await AccountModel.create({
      userId,
      name: input.name,
      type: input.type,
      currency: input.currency,
      openingBalance,
      loan: input.type === 'loan' && loanInput
        ? {
            borrowedAmount: loanInput.borrowedAmount,
            totalRepayable: loanInput.totalRepayable,
            monthlyPayment: loanInput.monthlyPayment,
            installmentCount: loanInput.installmentCount,
            paymentDay: loanInput.paymentDay,
            firstPaymentDate: loanInput.firstPaymentDate,
            paymentAccountId: paymentAccountId ?? null,
            note: loanInput.note,
            status: 'active',
            closedAt: null,
          }
        : null,
      deletedAt: null,
    });

    if (account.type === 'loan' && loanInput) {
      await createLoanInstallmentSchedule({
        userId,
        account,
        loan: {
          installmentCount: loanInput.installmentCount,
          paymentDay: loanInput.paymentDay,
          firstPaymentDate: loanInput.firstPaymentDate,
          monthlyPayment: loanInput.monthlyPayment,
          totalRepayable: loanInput.totalRepayable,
          paymentAccountId: paymentAccountId ?? null,
        },
      });

      if (paymentAccountId) {
        await createTransferPair({
          userId,
          fromAccountId: account._id,
          toAccountId: paymentAccountId,
          amount: loanInput.borrowedAmount,
          occurredAt: new Date(),
          description: `Loan disbursement: ${account.name}`,
        });
      }
    }

    reply.status(201);
    return accountSchema.parse(toAccountDto(account));
  });

  app.patch('/accounts/:id', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const accountId = parseObjectId((request.params as { id?: string }).id ?? '', 'id');
    const input = parseBody<AccountUpdateInput>(accountUpdateInputSchema, request.body);

    const account = await AccountModel.findOne({ _id: accountId, userId, deletedAt: null });
    if (!account) {
      throw new ApiError({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account not found',
        statusCode: 404,
      });
    }

    if (input.type && input.type !== account.type && (input.type === 'loan' || account.type === 'loan')) {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        message: 'Changing account type to or from loan is not supported',
        statusCode: 400,
      });
    }

    if (input.name !== undefined) {
      account.name = input.name;
    }
    if (input.type !== undefined) {
      account.type = input.type;
    }
    if (input.currency !== undefined) {
      await enforceBaseCurrency(userId, input.currency);
      account.currency = input.currency;
    }
    if (input.openingBalance !== undefined) {
      account.openingBalance = input.openingBalance;
    }
    if (input.loan !== undefined) {
      if (account.type !== 'loan') {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          message: 'Loan details can only be updated for loan accounts',
          statusCode: 400,
        });
      }

      const existingLoan = extractLoanFromAccount(account);
      if (!existingLoan) {
        throw new ApiError({
          code: 'VALIDATION_ERROR',
          message: 'Loan details are missing on account',
          statusCode: 400,
        });
      }

      const nextLoanInput = normalizeLoanCreateInput({
        borrowedAmount: input.loan.borrowedAmount ?? existingLoan.borrowedAmount,
        totalRepayable: input.loan.totalRepayable ?? existingLoan.totalRepayable,
        monthlyPayment: input.loan.monthlyPayment ?? existingLoan.monthlyPayment,
        installmentCount: input.loan.installmentCount ?? existingLoan.installmentCount,
        paymentDay: input.loan.paymentDay ?? existingLoan.paymentDay,
        firstPaymentDate: input.loan.firstPaymentDate ?? existingLoan.firstPaymentDate,
        paymentAccountId:
          input.loan.paymentAccountId ??
          (existingLoan.paymentAccountId ?? undefined),
        note: input.loan.note ?? (existingLoan.note ?? undefined),
      });

      const paymentAccountId = await ensurePaymentAccount({
        userId,
        paymentAccountId: nextLoanInput.paymentAccountId,
        currency: account.currency,
      });

      account.loan = {
        borrowedAmount: nextLoanInput.borrowedAmount,
        totalRepayable: nextLoanInput.totalRepayable,
        monthlyPayment: nextLoanInput.monthlyPayment,
        installmentCount: nextLoanInput.installmentCount,
        paymentDay: nextLoanInput.paymentDay,
        firstPaymentDate: nextLoanInput.firstPaymentDate,
        paymentAccountId: paymentAccountId ?? null,
        note: nextLoanInput.note,
        status: account.loan?.status ?? 'active',
        closedAt: account.loan?.closedAt ?? null,
      };
    }

    await account.save();

    return accountSchema.parse(toAccountDto(account));
  });

  app.post('/accounts/:id/loan/pay', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const accountId = parseObjectId((request.params as { id?: string }).id ?? '', 'id');
    const input = parseBody<LoanPaymentInput>(loanPaymentInputSchema, request.body);

    const loanAccount = await AccountModel.findOne({ _id: accountId, userId, deletedAt: null });
    if (!loanAccount || loanAccount.type !== 'loan' || !loanAccount.loan) {
      throw new ApiError({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Loan account not found',
        statusCode: 404,
      });
    }

    if (loanAccount.loan.status !== 'active') {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        message: 'Loan is not active',
        statusCode: 400,
      });
    }

    const fromAccount = await resolveActiveAccount(userId, parseObjectId(input.fromAccountId, 'fromAccountId'));
    if (fromAccount.currency !== loanAccount.currency) {
      throw new ApiError({
        code: 'TRANSFER_CURRENCY_MISMATCH',
        message: 'Loan and payment accounts must have matching currencies',
        statusCode: 400,
      });
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    const transfer = await createTransferPair({
      userId,
      fromAccountId: fromAccount._id,
      toAccountId: loanAccount._id,
      amount: input.amount,
      occurredAt,
      description: input.note?.trim() || `${loanAccount.name} installment payment`,
    });

    await markNextLoanInstallmentPaid({
      userId,
      loanAccountId: loanAccount._id,
      fromAccountId: fromAccount._id,
      occurredAt,
      linkedTransactionId: transfer.fromTransaction._id,
    });

    const remainingBalance = await calculateAccountCurrentBalance({
      userId,
      account: loanAccount,
    });
    if (remainingBalance >= -0.005) {
      if (Math.abs(remainingBalance) > 0.0001) {
        loanAccount.openingBalance = (loanAccount.openingBalance ?? 0) - remainingBalance;
      }
      loanAccount.loan.status = 'closed';
      loanAccount.loan.closedAt = new Date();
      await Promise.all([
        loanAccount.save(),
        cancelFutureLoanInstallments({ userId, loanAccountId: loanAccount._id }),
      ]);
    }

    const refreshedLoan = await AccountModel.findById(loanAccount._id);
    if (!refreshedLoan) {
      throw new ApiError({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Loan account not found',
        statusCode: 404,
      });
    }

    const refreshedBalance = await calculateAccountCurrentBalance({
      userId,
      account: refreshedLoan,
    });

    return loanPaymentResponseSchema.parse({
      account: toAccountDto(refreshedLoan),
      fromTransactionId: transfer.fromTransaction.id,
      toTransactionId: transfer.toTransaction.id,
      remainingBalance: refreshedBalance,
    });
  });

  app.post('/accounts/:id/loan/early-payoff', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const accountId = parseObjectId((request.params as { id?: string }).id ?? '', 'id');
    const input = parseBody<LoanEarlyPayoffInput>(loanEarlyPayoffInputSchema, request.body);

    const loanAccount = await AccountModel.findOne({ _id: accountId, userId, deletedAt: null });
    if (!loanAccount || loanAccount.type !== 'loan' || !loanAccount.loan) {
      throw new ApiError({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Loan account not found',
        statusCode: 404,
      });
    }

    if (loanAccount.loan.status !== 'active') {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        message: 'Loan is not active',
        statusCode: 400,
      });
    }

    const fromAccount = await resolveActiveAccount(userId, parseObjectId(input.fromAccountId, 'fromAccountId'));
    if (fromAccount.currency !== loanAccount.currency) {
      throw new ApiError({
        code: 'TRANSFER_CURRENCY_MISMATCH',
        message: 'Loan and payment accounts must have matching currencies',
        statusCode: 400,
      });
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    const transfer = await createTransferPair({
      userId,
      fromAccountId: fromAccount._id,
      toAccountId: loanAccount._id,
      amount: input.amount,
      occurredAt,
      description: input.note?.trim() || `${loanAccount.name} early payoff`,
    });

    let waiverAmount = 0;
    let adjustmentTransactionId: string | null = null;
    let remainingBalance = await calculateAccountCurrentBalance({
      userId,
      account: loanAccount,
    });

    if (remainingBalance < 0) {
      waiverAmount = Math.abs(remainingBalance);
      const adjustment = await TransactionModel.create({
        userId,
        accountId: loanAccount._id,
        categoryId: null,
        categoryKey: null,
        type: 'income',
        kind: 'transfer',
        transferGroupId: null,
        transferDirection: null,
        relatedAccountId: null,
        amount: waiverAmount,
        currency: loanAccount.currency,
        description: `${loanAccount.name} early payoff adjustment`,
        occurredAt,
        deletedAt: null,
      });
      adjustmentTransactionId = adjustment.id;
      remainingBalance = await calculateAccountCurrentBalance({
        userId,
        account: loanAccount,
      });
    }

    if (Math.abs(remainingBalance) > 0.0001) {
      loanAccount.openingBalance = (loanAccount.openingBalance ?? 0) - remainingBalance;
      remainingBalance = 0;
    }

    loanAccount.loan.status = 'closed_early';
    loanAccount.loan.closedAt = occurredAt;
    await loanAccount.save();

    const cancelledInstallments = await cancelFutureLoanInstallments({
      userId,
      loanAccountId: loanAccount._id,
    });

    const refreshedLoan = await AccountModel.findById(loanAccount._id);
    if (!refreshedLoan) {
      throw new ApiError({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Loan account not found',
        statusCode: 404,
      });
    }

    const refreshedBalance = await calculateAccountCurrentBalance({
      userId,
      account: refreshedLoan,
    });

    return loanEarlyPayoffResponseSchema.parse({
      account: toAccountDto(refreshedLoan),
      fromTransactionId: transfer.fromTransaction.id,
      toTransactionId: transfer.toTransaction.id,
      adjustmentTransactionId,
      cancelledInstallments,
      waiverAmount,
      remainingBalance: refreshedBalance,
    });
  });

  app.delete('/accounts/:id', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const accountId = parseObjectId((request.params as { id?: string }).id ?? '', 'id');

    const account = await AccountModel.findOne({ _id: accountId, userId, deletedAt: null });
    if (!account) {
      throw new ApiError({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account not found',
        statusCode: 404,
      });
    }

    account.deletedAt = new Date();
    await account.save();

    return logoutResponseSchema.parse({ ok: true });
  });
}
