import { Types } from 'mongoose';
import { ApiError } from '../errors.js';
import { AccountModel } from '../models/Account.js';
import { CategoryModel } from '../models/Category.js';
import { TransactionModel } from '../models/Transaction.js';
export async function resolveActiveAccount(userId, accountId) {
    const account = await AccountModel.findOne({
        _id: accountId,
        userId,
        deletedAt: null,
    });
    if (!account) {
        throw new ApiError({
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Account not found',
            statusCode: 404,
        });
    }
    return account;
}
export async function resolveActiveCategory(userId, categoryId) {
    const category = await CategoryModel.findOne({
        _id: categoryId,
        deletedAt: null,
        $or: [{ userId }, { userId: null }],
    });
    if (!category) {
        throw new ApiError({
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found',
            statusCode: 404,
        });
    }
    return category;
}
export function validateCurrency(accountCurrency, transactionCurrency) {
    if (accountCurrency !== transactionCurrency) {
        throw new ApiError({
            code: 'CURRENCY_MISMATCH',
            message: 'Transaction currency must match account currency',
            statusCode: 400,
        });
    }
}
export function validateTransactionType(categoryType, transactionType) {
    if (categoryType !== transactionType) {
        throw new ApiError({
            code: 'CATEGORY_TYPE_MISMATCH',
            message: 'Transaction type must match category type',
            statusCode: 400,
        });
    }
}
export async function createNormalTransaction(input) {
    return TransactionModel.create({
        userId: input.userId,
        accountId: input.accountId,
        categoryId: input.categoryId,
        type: input.type,
        kind: 'normal',
        transferGroupId: null,
        transferDirection: null,
        relatedAccountId: null,
        amount: input.amount,
        currency: input.currency,
        description: input.description ?? null,
        occurredAt: input.occurredAt,
        deletedAt: null,
    });
}
export async function createTransferPair(input) {
    if (input.fromAccountId.toString() === input.toAccountId.toString()) {
        throw new ApiError({
            code: 'TRANSFER_ACCOUNT_CONFLICT',
            message: '`fromAccountId` and `toAccountId` must differ',
            statusCode: 400,
        });
    }
    const [fromAccount, toAccount] = await Promise.all([
        resolveActiveAccount(input.userId, input.fromAccountId),
        resolveActiveAccount(input.userId, input.toAccountId),
    ]);
    if (fromAccount.currency !== toAccount.currency) {
        throw new ApiError({
            code: 'TRANSFER_CURRENCY_MISMATCH',
            message: 'Transfer accounts must have matching currencies',
            statusCode: 400,
        });
    }
    const groupId = new Types.ObjectId();
    const [fromTransaction, toTransaction] = await Promise.all([
        TransactionModel.create({
            userId: input.userId,
            accountId: fromAccount._id,
            categoryId: null,
            type: 'expense',
            kind: 'transfer',
            transferGroupId: groupId,
            transferDirection: 'out',
            relatedAccountId: toAccount._id,
            amount: input.amount,
            currency: fromAccount.currency,
            description: input.description ?? null,
            occurredAt: input.occurredAt,
            deletedAt: null,
        }),
        TransactionModel.create({
            userId: input.userId,
            accountId: toAccount._id,
            categoryId: null,
            type: 'income',
            kind: 'transfer',
            transferGroupId: groupId,
            transferDirection: 'in',
            relatedAccountId: fromAccount._id,
            amount: input.amount,
            currency: toAccount.currency,
            description: input.description ?? null,
            occurredAt: input.occurredAt,
            deletedAt: null,
        }),
    ]);
    return {
        groupId,
        fromTransaction,
        toTransaction,
    };
}
