export function toTransactionDto(transaction) {
    const stamped = transaction;
    return {
        id: transaction.id,
        accountId: transaction.accountId.toString(),
        categoryId: transaction.categoryId ? transaction.categoryId.toString() : null,
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
    };
}
