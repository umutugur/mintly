import { mePreferencesResponseSchema, mePreferencesUpdateInputSchema, meResponseSchema, meUpdateInputSchema, } from '@finsight/shared';
import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { UserModel } from '../models/User.js';
import { parseBody } from './utils.js';
export function registerMeRoute(app) {
    app.get('/me', { preHandler: authenticate }, async (request) => {
        if (!request.user) {
            throw new ApiError({
                code: 'UNAUTHORIZED',
                message: 'Unauthorized',
                statusCode: 401,
            });
        }
        const user = await UserModel.findById(request.user.id)
            .select('_id email name baseCurrency savingsTargetRate riskProfile');
        if (!user) {
            throw new ApiError({
                code: 'UNAUTHORIZED',
                message: 'User not found',
                statusCode: 401,
            });
        }
        return meResponseSchema.parse({
            user: {
                id: user.id,
                email: user.email,
                name: user.name ?? null,
                baseCurrency: user.baseCurrency ?? null,
                savingsTargetRate: user.savingsTargetRate ?? 20,
                riskProfile: user.riskProfile ?? 'medium',
            },
        });
    });
    app.patch('/me', { preHandler: authenticate }, async (request) => {
        if (!request.user) {
            throw new ApiError({
                code: 'UNAUTHORIZED',
                message: 'Unauthorized',
                statusCode: 401,
            });
        }
        const input = parseBody(meUpdateInputSchema, request.body);
        const update = {};
        if (input.name !== undefined) {
            update.name = input.name;
        }
        const user = await UserModel.findByIdAndUpdate(request.user.id, { $set: update }, { new: true }).select('_id email name baseCurrency savingsTargetRate riskProfile');
        if (!user) {
            throw new ApiError({
                code: 'UNAUTHORIZED',
                message: 'User not found',
                statusCode: 401,
            });
        }
        return meResponseSchema.parse({
            user: {
                id: user.id,
                email: user.email,
                name: user.name ?? null,
                baseCurrency: user.baseCurrency ?? null,
                savingsTargetRate: user.savingsTargetRate ?? 20,
                riskProfile: user.riskProfile ?? 'medium',
            },
        });
    });
    app.get('/me/preferences', { preHandler: authenticate }, async (request) => {
        if (!request.user) {
            throw new ApiError({
                code: 'UNAUTHORIZED',
                message: 'Unauthorized',
                statusCode: 401,
            });
        }
        const user = await UserModel.findById(request.user.id).select('_id savingsTargetRate riskProfile');
        if (!user) {
            throw new ApiError({
                code: 'UNAUTHORIZED',
                message: 'User not found',
                statusCode: 401,
            });
        }
        return mePreferencesResponseSchema.parse({
            preferences: {
                savingsTargetRate: user.savingsTargetRate ?? 20,
                riskProfile: user.riskProfile ?? 'medium',
            },
        });
    });
    app.patch('/me/preferences', { preHandler: authenticate }, async (request) => {
        if (!request.user) {
            throw new ApiError({
                code: 'UNAUTHORIZED',
                message: 'Unauthorized',
                statusCode: 401,
            });
        }
        const input = parseBody(mePreferencesUpdateInputSchema, request.body);
        const update = {};
        if (input.savingsTargetRate !== undefined) {
            update.savingsTargetRate = input.savingsTargetRate;
        }
        if (input.riskProfile !== undefined) {
            update.riskProfile = input.riskProfile;
        }
        const user = await UserModel.findByIdAndUpdate(request.user.id, { $set: update }, { new: true }).select('_id savingsTargetRate riskProfile');
        if (!user) {
            throw new ApiError({
                code: 'UNAUTHORIZED',
                message: 'User not found',
                statusCode: 401,
            });
        }
        return mePreferencesResponseSchema.parse({
            preferences: {
                savingsTargetRate: user.savingsTargetRate ?? 20,
                riskProfile: user.riskProfile ?? 'medium',
            },
        });
    });
}
