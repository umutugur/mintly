import { exportTransactionsCsvResponseSchema, exportTransactionsQuerySchema, } from '@finsight/shared';
import { authenticate } from '../auth/middleware.js';
import { AccountModel } from '../models/Account.js';
import { CategoryModel } from '../models/Category.js';
import { TransactionModel } from '../models/Transaction.js';
import { parseObjectId, parseQuery, requireUser } from './utils.js';
function escapeCsvField(value) {
    if (value.includes('"')) {
        value = value.replace(/"/g, '""');
    }
    if (value.includes(',') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
        return `"${value}"`;
    }
    return value;
}
function toCsvLine(fields) {
    return fields.map((field) => escapeCsvField(String(field))).join(',');
}
export function registerExportRoutes(app) {
    app.get('/export/transactions.csv', { preHandler: authenticate }, async (request, reply) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const query = parseQuery(exportTransactionsQuerySchema, request.query);
        const filter = {
            userId,
            deletedAt: null,
        };
        if (query.accountId) {
            filter.accountId = parseObjectId(query.accountId, 'accountId');
        }
        if (query.type) {
            filter.type = query.type;
        }
        if (query.kind) {
            filter.kind = query.kind;
        }
        if (query.from || query.to) {
            filter.occurredAt = {
                ...(query.from ? { $gte: new Date(query.from) } : {}),
                ...(query.to ? { $lte: new Date(query.to) } : {}),
            };
        }
        const transactions = await TransactionModel.find(filter).sort({ occurredAt: 1, _id: 1 });
        const accountIds = [...new Set(transactions.map((transaction) => transaction.accountId.toString()))].map((id) => parseObjectId(id, 'accountId'));
        const categoryIds = [
            ...new Set(transactions
                .map((transaction) => transaction.categoryId?.toString())
                .filter((categoryId) => Boolean(categoryId))),
        ].map((id) => parseObjectId(id, 'categoryId'));
        const [accounts, categories] = await Promise.all([
            accountIds.length > 0
                ? AccountModel.find({ _id: { $in: accountIds }, userId }).select('_id name')
                : Promise.resolve([]),
            categoryIds.length > 0
                ? CategoryModel.find({
                    _id: { $in: categoryIds },
                    $or: [{ userId }, { userId: null }],
                }).select('_id name')
                : Promise.resolve([]),
        ]);
        const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));
        const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
        const lines = [
            toCsvLine([
                'occurredAt',
                'type',
                'kind',
                'accountName',
                'categoryName',
                'amount',
                'currency',
                'description',
            ]),
            ...transactions.map((transaction) => toCsvLine([
                transaction.occurredAt.toISOString(),
                transaction.type,
                transaction.kind,
                accountNameById.get(transaction.accountId.toString()) ?? 'Unknown',
                transaction.categoryId ? categoryNameById.get(transaction.categoryId.toString()) ?? '' : '',
                transaction.amount,
                transaction.currency,
                transaction.description ?? '',
            ])),
        ];
        const csv = lines.join('\n');
        reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', 'attachment; filename="transactions.csv"');
        return exportTransactionsCsvResponseSchema.parse(csv);
    });
}
