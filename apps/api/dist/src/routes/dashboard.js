import { dashboardRecentResponseSchema } from '@finsight/shared';
import { authenticate } from '../auth/middleware.js';
import { toTransactionDto } from '../lib/transaction-dto.js';
import { AccountModel } from '../models/Account.js';
import { TransactionModel } from '../models/Transaction.js';
import { UpcomingPaymentModel } from '../models/UpcomingPayment.js';
import { parseObjectId, requireUser } from './utils.js';
function toAccountBalance(account, balanceByAccountId) {
    return {
        accountId: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        balance: balanceByAccountId.get(account.id) ?? 0,
    };
}
function toUpcomingPaymentDto(payment) {
    const stamped = payment;
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
export function registerDashboardRoutes(app) {
    app.get('/dashboard/recent', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const now = new Date();
        const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const rangeEnd = new Date(rangeStart);
        rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);
        rangeEnd.setUTCHours(23, 59, 59, 999);
        const [recentTransactions, accounts, aggregatedBalances, upcomingPaymentsDueSoon] = await Promise.all([
            TransactionModel.find({ userId, deletedAt: null }).sort({ occurredAt: -1, _id: -1 }).limit(10),
            AccountModel.find({ userId, deletedAt: null }).sort({ createdAt: -1 }),
            TransactionModel.aggregate([
                { $match: { userId, deletedAt: null } },
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
                {
                    $project: {
                        balance: { $subtract: ['$income', '$expense'] },
                    },
                },
            ]),
            UpcomingPaymentModel.find({
                userId,
                status: 'upcoming',
                dueDate: { $gte: rangeStart, $lte: rangeEnd },
            })
                .sort({ dueDate: 1, _id: 1 })
                .limit(5),
        ]);
        const balanceByAccountId = new Map(aggregatedBalances.map((entry) => [entry._id.toString(), entry.balance]));
        const balances = accounts.map((account) => toAccountBalance(account, balanceByAccountId));
        const totalBalance = balances.reduce((sum, accountBalance) => sum + accountBalance.balance, 0);
        return dashboardRecentResponseSchema.parse({
            recentTransactions: recentTransactions.map((transaction) => toTransactionDto(transaction)),
            totalBalance,
            balances,
            upcomingPaymentsDueSoon: upcomingPaymentsDueSoon.map((payment) => toUpcomingPaymentDto(payment)),
        });
    });
}
