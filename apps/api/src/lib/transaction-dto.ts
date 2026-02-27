import type { Transaction } from '@mintly/shared';

import type { TransactionDocument } from '../models/Transaction.js';

export function toTransactionDto(transaction: TransactionDocument): Transaction {
  const stamped = transaction as TransactionDocument & {
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
  };

  return {
    id: transaction.id,
    accountId: transaction.accountId.toString(),
    categoryId: transaction.categoryId ? transaction.categoryId.toString() : null,
    categoryKey: transaction.categoryKey ?? null,
    type: transaction.type,
    kind: transaction.kind,
    transferGroupId: transaction.transferGroupId ? transaction.transferGroupId.toString() : null,
    transferDirection: transaction.transferDirection ?? null,
    relatedAccountId: transaction.relatedAccountId ? transaction.relatedAccountId.toString() : null,
    amount: transaction.amount,
    currency: transaction.currency,
    description: transaction.description ?? null,
    occurredAt: transaction.occurredAt.toISOString(),
    createdAt: stamped.createdAt.toISOString(),
    updatedAt: stamped.updatedAt.toISOString(),
    deletedAt: stamped.deletedAt ? stamped.deletedAt.toISOString() : null,
  };
}
