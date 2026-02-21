import {
  upcomingPaymentCreateInputSchema,
  upcomingPaymentListQuerySchema,
  upcomingPaymentListResponseSchema,
  upcomingPaymentMarkPaidInputSchema,
  upcomingPaymentMarkPaidResponseSchema,
  upcomingPaymentSchema,
  upcomingPaymentUpdateInputSchema,
  type UpcomingPayment,
  type UpcomingPaymentCreateInput,
  type UpcomingPaymentListQuery,
  type UpcomingPaymentMarkPaidInput,
  type UpcomingPaymentUpdateInput,
} from '@mintly/shared';
import type { FastifyInstance } from 'fastify';
import { type FilterQuery, type Types } from 'mongoose';

import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import {
  createNormalTransaction,
  resolveActiveAccount,
  validateCurrency,
} from '../lib/ledger.js';
import { toTransactionDto } from '../lib/transaction-dto.js';
import { AccountModel } from '../models/Account.js';
import { CategoryModel, type CategoryDocument } from '../models/Category.js';
import { TransactionModel } from '../models/Transaction.js';
import { UpcomingPaymentModel, type UpcomingPaymentDocument } from '../models/UpcomingPayment.js';
import { UserModel } from '../models/User.js';

import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';

function toUpcomingPaymentDto(payment: UpcomingPaymentDocument): UpcomingPayment {
  const stamped = payment as UpcomingPaymentDocument & { createdAt: Date; updatedAt: Date };

  return {
    id: payment.id,
    title: payment.title,
    type: payment.type,
    amount: payment.amount,
    currency: payment.currency,
    dueDate: payment.dueDate.toISOString(),
    status: payment.status,
    source: payment.source,
    linkedTransactionId: payment.linkedTransactionId ? payment.linkedTransactionId.toString() : null,
    recurringTemplateId: payment.recurringTemplateId ? payment.recurringTemplateId.toString() : null,
    meta: payment.meta
      ? {
          vendor: payment.meta.vendor ?? undefined,
          invoiceNo: payment.meta.invoiceNo ?? undefined,
          rawText: payment.meta.rawText ?? undefined,
          detectedCurrency: payment.meta.detectedCurrency ?? undefined,
        }
      : null,
    createdAt: stamped.createdAt.toISOString(),
    updatedAt: stamped.updatedAt.toISOString(),
  };
}

function toDayStartUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDayEndUtc(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

function defaultDateRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 45);
  to.setUTCHours(23, 59, 59, 999);

  return { from, to };
}

async function requireBaseCurrency(userId: Types.ObjectId): Promise<string> {
  const user = await UserModel.findById(userId).select('_id baseCurrency');
  if (!user) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'User not found',
      statusCode: 401,
    });
  }

  if (!user.baseCurrency) {
    throw new ApiError({
      code: 'BASE_CURRENCY_NOT_SET',
      message: 'Base currency is not configured',
      statusCode: 400,
    });
  }

  return user.baseCurrency;
}

async function resolvePreferredExpenseCategory(
  userId: Types.ObjectId,
  paymentType: UpcomingPayment['type'],
): Promise<CategoryDocument> {
  const preferredRegex = paymentType === 'rent' ? /(rent|kira)/i : /(bill|fatura|utility|invoice)/i;

  const preferred = await CategoryModel.findOne({
    type: 'expense',
    deletedAt: null,
    $and: [
      {
        $or: [{ userId }, { userId: null }],
      },
      {
        $or: [
          { key: { $regex: preferredRegex } },
          { name: { $regex: preferredRegex } },
        ],
      },
    ],
  }).sort({ userId: -1, isSystem: -1, createdAt: -1 });

  if (preferred) {
    return preferred;
  }

  const fallback = await CategoryModel.findOne({
    type: 'expense',
    deletedAt: null,
    $or: [{ userId }, { userId: null }],
  }).sort({ userId: -1, isSystem: -1, createdAt: -1 });

  if (!fallback) {
    throw new ApiError({
      code: 'CATEGORY_NOT_FOUND',
      message: 'No expense category available',
      statusCode: 404,
    });
  }

  return fallback;
}

export function registerUpcomingPaymentRoutes(app: FastifyInstance): void {
  app.get('/upcoming-payments', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const query = parseQuery<UpcomingPaymentListQuery>(upcomingPaymentListQuerySchema, request.query);

    const defaults = defaultDateRange();
    const from = query.from ? toDayStartUtc(query.from) : defaults.from;
    const to = query.to ? toDayEndUtc(query.to) : defaults.to;

    const filter: FilterQuery<UpcomingPaymentDocument> = {
      userId,
      status: query.status,
      dueDate: {
        $gte: from,
        $lte: to,
      },
    };

    const upcomingPayments = await UpcomingPaymentModel.find(filter)
      .sort({ dueDate: 1, _id: 1 })
      .limit(query.limit);

    return upcomingPaymentListResponseSchema.parse({
      upcomingPayments: upcomingPayments.map((payment) => toUpcomingPaymentDto(payment)),
    });
  });

  app.post('/upcoming-payments', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const input = parseBody<UpcomingPaymentCreateInput>(upcomingPaymentCreateInputSchema, request.body);

    const baseCurrency = await requireBaseCurrency(userId);
    if (input.currency !== baseCurrency) {
      throw new ApiError({
        code: 'BASE_CURRENCY_MISMATCH',
        message: 'Upcoming payment currency must match your base currency',
        statusCode: 400,
      });
    }

    const upcomingPayment = await UpcomingPaymentModel.create({
      userId,
      title: input.title,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      dueDate: new Date(input.dueDate),
      status: 'upcoming',
      source: input.source,
      linkedTransactionId: null,
      recurringTemplateId: null,
      meta: input.meta
        ? {
            vendor: input.meta.vendor ?? null,
            invoiceNo: input.meta.invoiceNo ?? null,
            rawText: input.meta.rawText ?? null,
            detectedCurrency: input.meta.detectedCurrency ?? null,
          }
        : null,
    });

    reply.status(201);
    return upcomingPaymentSchema.parse(toUpcomingPaymentDto(upcomingPayment));
  });

  app.patch('/upcoming-payments/:id', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const id = parseObjectId((request.params as { id?: string }).id ?? '', 'id');
    const input = parseBody<UpcomingPaymentUpdateInput>(upcomingPaymentUpdateInputSchema, request.body);

    const upcomingPayment = await UpcomingPaymentModel.findOne({
      _id: id,
      userId,
    });

    if (!upcomingPayment) {
      throw new ApiError({
        code: 'UPCOMING_PAYMENT_NOT_FOUND',
        message: 'Upcoming payment not found',
        statusCode: 404,
      });
    }

    if (input.title !== undefined) {
      upcomingPayment.title = input.title;
    }
    if (input.type !== undefined) {
      upcomingPayment.type = input.type;
    }
    if (input.amount !== undefined) {
      upcomingPayment.amount = input.amount;
    }
    if (input.dueDate !== undefined) {
      upcomingPayment.dueDate = new Date(input.dueDate);
    }
    if (input.status !== undefined) {
      upcomingPayment.status = input.status;
    }

    await upcomingPayment.save();

    return upcomingPaymentSchema.parse(toUpcomingPaymentDto(upcomingPayment));
  });

  app.post('/upcoming-payments/:id/mark-paid', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const id = parseObjectId((request.params as { id?: string }).id ?? '', 'id');
    const input = parseBody<UpcomingPaymentMarkPaidInput>(upcomingPaymentMarkPaidInputSchema, request.body);

    const upcomingPayment = await UpcomingPaymentModel.findOne({
      _id: id,
      userId,
    });

    if (!upcomingPayment) {
      throw new ApiError({
        code: 'UPCOMING_PAYMENT_NOT_FOUND',
        message: 'Upcoming payment not found',
        statusCode: 404,
      });
    }

    if (upcomingPayment.status === 'paid') {
      const linkedTransaction = upcomingPayment.linkedTransactionId
        ? await TransactionModel.findOne({
            _id: upcomingPayment.linkedTransactionId,
            userId,
          })
        : null;

      return upcomingPaymentMarkPaidResponseSchema.parse({
        upcomingPayment: toUpcomingPaymentDto(upcomingPayment),
        transaction: linkedTransaction ? toTransactionDto(linkedTransaction) : null,
      });
    }

    const account = input.accountId
      ? await resolveActiveAccount(userId, parseObjectId(input.accountId, 'accountId'))
      : await AccountModel.findOne({ userId, deletedAt: null }).sort({ createdAt: -1 });

    if (!account) {
      throw new ApiError({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account not found',
        statusCode: 404,
      });
    }

    validateCurrency(account.currency, upcomingPayment.currency);

    const category = await resolvePreferredExpenseCategory(userId, upcomingPayment.type);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    const transaction = await createNormalTransaction({
      userId,
      accountId: account._id,
      categoryId: category._id,
      type: 'expense',
      amount: upcomingPayment.amount,
      currency: upcomingPayment.currency,
      description: upcomingPayment.title,
      occurredAt,
    });

    upcomingPayment.status = 'paid';
    upcomingPayment.linkedTransactionId = transaction._id;
    await upcomingPayment.save();

    return upcomingPaymentMarkPaidResponseSchema.parse({
      upcomingPayment: toUpcomingPaymentDto(upcomingPayment),
      transaction: toTransactionDto(transaction),
    });
  });
}
