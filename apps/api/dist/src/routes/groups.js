import { groupCreateInputSchema, groupExpenseCreateInputSchema, groupExpenseListResponseSchema, groupExpenseSchema, groupListResponseSchema, groupSchema, groupSettleResponseSchema, } from '@finsight/shared';
import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { GroupExpenseModel } from '../models/GroupExpense.js';
import { GroupModel } from '../models/Group.js';
import { parseBody, parseObjectId, requireUser } from './utils.js';
function normalizeEmail(value) {
    return value.trim().toLowerCase();
}
function getMemberId(member) {
    const raw = member._id;
    if (!raw) {
        return '';
    }
    return typeof raw === 'string' ? raw : raw.toString();
}
function toGroupDto(group) {
    const stamped = group;
    return {
        id: group.id,
        name: group.name,
        ownerUserId: group.userId.toString(),
        members: group.members.map((member) => {
            const memberId = getMemberId(member);
            return {
                id: memberId,
                email: member.email,
                name: member.name,
                userId: member.userId ? member.userId.toString() : null,
            };
        }),
        createdAt: stamped.createdAt.toISOString(),
        updatedAt: stamped.updatedAt.toISOString(),
    };
}
function toGroupExpenseDto(expense) {
    const stamped = expense;
    return {
        id: expense.id,
        groupId: expense.groupId.toString(),
        paidByMemberId: expense.paidByMemberId,
        title: expense.title,
        amount: expense.amount,
        currency: expense.currency,
        splits: expense.splits.map((split) => ({
            memberId: split.memberId,
            amount: split.amount,
        })),
        settledAt: expense.settledAt ? expense.settledAt.toISOString() : null,
        createdAt: stamped.createdAt.toISOString(),
        updatedAt: stamped.updatedAt.toISOString(),
    };
}
async function requireOwnedGroup(userId, groupId) {
    const group = await GroupModel.findOne({
        _id: groupId,
        userId,
    });
    if (!group) {
        throw new ApiError({
            code: 'GROUP_NOT_FOUND',
            message: 'Group not found',
            statusCode: 404,
        });
    }
    return group;
}
function validateMemberIds(group, payload) {
    const validMemberIds = new Set(group.members.map((member) => getMemberId(member)).filter(Boolean));
    if (!validMemberIds.has(payload.paidByMemberId)) {
        throw new ApiError({
            code: 'INVALID_MEMBER',
            message: 'paidByMemberId does not belong to this group',
            statusCode: 400,
        });
    }
    for (const split of payload.splits) {
        if (!validMemberIds.has(split.memberId)) {
            throw new ApiError({
                code: 'INVALID_MEMBER',
                message: 'split memberId does not belong to this group',
                statusCode: 400,
            });
        }
    }
}
function validateSplitTotal(payload) {
    const total = payload.splits.reduce((sum, split) => sum + split.amount, 0);
    const diff = Math.abs(total - payload.amount);
    if (diff > 0.01) {
        throw new ApiError({
            code: 'INVALID_SPLIT_TOTAL',
            message: 'Split amounts must equal total amount',
            statusCode: 400,
        });
    }
}
export function registerGroupRoutes(app) {
    app.post('/groups', { preHandler: authenticate }, async (request, reply) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const input = parseBody(groupCreateInputSchema, request.body);
        const ownerEmail = normalizeEmail(user.email);
        const ownerName = input.ownerName?.trim() || 'You';
        const seenEmails = new Set([ownerEmail]);
        const members = [
            {
                email: ownerEmail,
                name: ownerName,
                userId,
            },
        ];
        for (const member of input.members) {
            const email = normalizeEmail(member.email);
            if (seenEmails.has(email)) {
                continue;
            }
            seenEmails.add(email);
            members.push({
                email,
                name: member.name.trim(),
                userId: member.userId ? parseObjectId(member.userId, 'member.userId') : null,
            });
        }
        const group = await GroupModel.create({
            userId,
            name: input.name,
            members,
        });
        reply.status(201);
        return groupSchema.parse(toGroupDto(group));
    });
    app.get('/groups', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const groups = await GroupModel.find({ userId }).sort({ createdAt: -1 });
        return groupListResponseSchema.parse({
            groups: groups.map((group) => toGroupDto(group)),
        });
    });
    app.get('/groups/:id', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const groupId = parseObjectId(request.params.id ?? '', 'id');
        const group = await requireOwnedGroup(userId, groupId);
        return groupSchema.parse(toGroupDto(group));
    });
    app.post('/groups/:id/expenses', { preHandler: authenticate }, async (request, reply) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const groupId = parseObjectId(request.params.id ?? '', 'id');
        const input = parseBody(groupExpenseCreateInputSchema, request.body);
        const group = await requireOwnedGroup(userId, groupId);
        validateMemberIds(group, input);
        validateSplitTotal(input);
        const expense = await GroupExpenseModel.create({
            groupId,
            paidByMemberId: input.paidByMemberId,
            title: input.title,
            amount: input.amount,
            currency: input.currency,
            splits: input.splits,
            settledAt: null,
        });
        reply.status(201);
        return groupExpenseSchema.parse(toGroupExpenseDto(expense));
    });
    app.get('/groups/:id/expenses', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const groupId = parseObjectId(request.params.id ?? '', 'id');
        await requireOwnedGroup(userId, groupId);
        const expenses = await GroupExpenseModel.find({ groupId }).sort({ createdAt: -1 });
        return groupExpenseListResponseSchema.parse({
            expenses: expenses.map((expense) => toGroupExpenseDto(expense)),
        });
    });
    app.post('/groups/:id/settle', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const groupId = parseObjectId(request.params.id ?? '', 'id');
        await requireOwnedGroup(userId, groupId);
        const now = new Date();
        const result = await GroupExpenseModel.updateMany({
            groupId,
            settledAt: null,
        }, {
            $set: {
                settledAt: now,
            },
        });
        return groupSettleResponseSchema.parse({
            ok: true,
            settledCount: result.modifiedCount,
        });
    });
}
