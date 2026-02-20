import {
  logoutResponseSchema,
  transferCreateInputSchema,
  transferCreateResponseSchema,
  type TransferCreateInput,
} from '@finsight/shared';
import type { FastifyInstance } from 'fastify';

import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { createTransferPair } from '../lib/ledger.js';
import { TransactionModel } from '../models/Transaction.js';

import { parseBody, parseObjectId, requireUser } from './utils.js';

export function registerTransferRoutes(app: FastifyInstance): void {
  app.post('/transfers', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const input = parseBody<TransferCreateInput>(transferCreateInputSchema, request.body);

    const result = await createTransferPair({
      userId,
      fromAccountId: parseObjectId(input.fromAccountId, 'fromAccountId'),
      toAccountId: parseObjectId(input.toAccountId, 'toAccountId'),
      amount: input.amount,
      occurredAt: new Date(input.occurredAt),
      description: input.description ?? null,
    });

    reply.status(201);
    return transferCreateResponseSchema.parse({
      groupId: result.groupId.toString(),
      fromTransactionId: result.fromTransaction.id,
      toTransactionId: result.toTransaction.id,
    });
  });

  app.delete('/transfers/:transferGroupId', { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const userId = parseObjectId(user.id, 'userId');
    const transferGroupId = parseObjectId(
      (request.params as { transferGroupId?: string }).transferGroupId ?? '',
      'transferGroupId',
    );

    const activeTransfers = await TransactionModel.find({
      userId,
      kind: 'transfer',
      transferGroupId,
      deletedAt: null,
    }).select({ _id: 1 });

    if (activeTransfers.length === 0) {
      throw new ApiError({
        code: 'TRANSFER_NOT_FOUND',
        message: 'Transfer not found',
        statusCode: 404,
      });
    }

    await TransactionModel.updateMany(
      {
        userId,
        kind: 'transfer',
        transferGroupId,
        deletedAt: null,
      },
      {
        $set: { deletedAt: new Date() },
      },
    );

    return logoutResponseSchema.parse({ ok: true });
  });
}
