import { categoryCreateInputSchema, categoryListResponseSchema, categorySchema, logoutResponseSchema, } from '@finsight/shared';
import { z } from 'zod';
import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { CategoryModel } from '../models/Category.js';
import { parseBody, parseObjectId, parseQuery, requireUser } from './utils.js';
const categoryListQuerySchema = z.object({
    includeDeleted: z.coerce.boolean().default(false),
});
function toCategoryDto(category) {
    const stamped = category;
    return {
        id: category.id,
        name: category.name,
        type: category.type,
        color: category.color,
        icon: category.icon ?? null,
        isSystem: category.isSystem,
        createdAt: stamped.createdAt.toISOString(),
        updatedAt: stamped.updatedAt.toISOString(),
    };
}
export function registerCategoryRoutes(app) {
    app.get('/categories', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const query = parseQuery(categoryListQuerySchema, request.query);
        const categories = await CategoryModel.find({
            $or: [
                { userId: null, deletedAt: null },
                query.includeDeleted ? { userId } : { userId, deletedAt: null },
            ],
        }).sort({ isSystem: -1, name: 1, createdAt: -1 });
        return categoryListResponseSchema.parse({
            categories: categories.map((category) => toCategoryDto(category)),
        });
    });
    app.post('/categories', { preHandler: authenticate }, async (request, reply) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const input = parseBody(categoryCreateInputSchema, request.body);
        const category = await CategoryModel.create({
            userId,
            name: input.name,
            type: input.type,
            color: input.color,
            icon: input.icon ?? null,
            isSystem: false,
            deletedAt: null,
        });
        reply.status(201);
        return categorySchema.parse(toCategoryDto(category));
    });
    app.delete('/categories/:id', { preHandler: authenticate }, async (request) => {
        const user = requireUser(request);
        const userId = parseObjectId(user.id, 'userId');
        const categoryId = parseObjectId(request.params.id ?? '', 'id');
        const category = await CategoryModel.findOne({
            _id: categoryId,
            userId,
            isSystem: false,
            deletedAt: null,
        });
        if (!category) {
            throw new ApiError({
                code: 'CATEGORY_NOT_FOUND',
                message: 'Category not found',
                statusCode: 404,
            });
        }
        category.deletedAt = new Date();
        await category.save();
        return logoutResponseSchema.parse({ ok: true });
    });
}
