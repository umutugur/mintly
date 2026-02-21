import {
  accountCreateInputSchema,
  accountListResponseSchema,
  accountSchema,
  accountUpdateInputSchema,
  logoutResponseSchema,
  type Account,
  type AccountCreateInput,
  type AccountUpdateInput,
} from '@mintly/shared';
import type { FastifyInstance } from 'fastify';
import type { Types } from 'mongoose';
import { z } from 'zod';

import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { AccountModel, type AccountDocument } from '../models/Account.js';
import { UserModel } from '../models/User.js';

import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';

const accountListQuerySchema = z.object({
  includeDeleted: z.coerce.boolean().default(false),
});

function toAccountDto(account: AccountDocument): Account {
  const stamped = account as AccountDocument & { createdAt: Date; updatedAt: Date };

  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
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

export function registerAccountRoutes(app: FastifyInstance): void {
  app.get('/accounts', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const query = parseQuery(accountListQuerySchema, request.query);

    const filter = query.includeDeleted ? { userId } : { userId, deletedAt: null };
    const accounts = await AccountModel.find(filter).sort({ createdAt: -1 });

    return accountListResponseSchema.parse({
      accounts: accounts.map((account) => toAccountDto(account)),
    });
  });

  app.post('/accounts', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const input = parseBody<AccountCreateInput>(accountCreateInputSchema, request.body);

    await enforceBaseCurrency(userId, input.currency);

    const account = await AccountModel.create({
      userId,
      name: input.name,
      type: input.type,
      currency: input.currency,
      deletedAt: null,
    });

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

    await account.save();

    return accountSchema.parse(toAccountDto(account));
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
