import {
  logoutResponseSchema,
  meChangePasswordInputSchema,
  mePreferencesResponseSchema,
  mePreferencesUpdateInputSchema,
  meResponseSchema,
  meUpdateInputSchema,
  type MeChangePasswordInput,
  type MePreferencesUpdateInput,
  type MeUpdateInput,
} from '@mintly/shared';
import type { FastifyInstance } from 'fastify';

import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { AccountModel } from '../models/Account.js';
import { RefreshTokenModel } from '../models/RefreshToken.js';
import { TransactionModel } from '../models/Transaction.js';
import { UpcomingPaymentModel } from '../models/UpcomingPayment.js';
import { UserModel } from '../models/User.js';

import { parseBody } from './utils.js';

function requireUserId(request: { user?: { id: string } }): string {
  if (!request.user) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
      statusCode: 401,
    });
  }

  return request.user.id;
}

function toMeResponse(user: {
  id: string;
  email: string;
  name?: string | null;
  baseCurrency?: string | null;
  savingsTargetRate?: number | null;
  riskProfile?: 'low' | 'medium' | 'high' | null;
  providers?: Array<{ provider: string; uid: string }> | null;
}) {
  return meResponseSchema.parse({
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      baseCurrency: user.baseCurrency ?? null,
      canChangePassword: (user.providers?.length ?? 0) === 0,
      savingsTargetRate: user.savingsTargetRate ?? 20,
      riskProfile: user.riskProfile ?? 'medium',
    },
  });
}

function toMePreferencesResponse(user: {
  savingsTargetRate?: number | null;
  riskProfile?: 'low' | 'medium' | 'high' | null;
  notificationsEnabled?: boolean | null;
}) {
  return mePreferencesResponseSchema.parse({
    preferences: {
      savingsTargetRate: user.savingsTargetRate ?? 20,
      riskProfile: user.riskProfile ?? 'medium',
      notificationsEnabled: user.notificationsEnabled ?? true,
    },
  });
}

async function synchronizeUserCurrency(userId: string, nextCurrency: string): Promise<void> {
  await Promise.all([
    AccountModel.updateMany({ userId }, { $set: { currency: nextCurrency } }),
    TransactionModel.updateMany({ userId }, { $set: { currency: nextCurrency } }),
    UpcomingPaymentModel.updateMany({ userId }, { $set: { currency: nextCurrency } }),
  ]);
}

export function registerMeRoute(app: FastifyInstance): void {
  app.get('/me', { preHandler: authenticate }, async (request) => {
    const userId = requireUserId(request);

    const user = await UserModel.findById(userId)
      .select('_id email name baseCurrency savingsTargetRate riskProfile providers');

    if (!user) {
      throw new ApiError({
        code: 'UNAUTHORIZED',
        message: 'User not found',
        statusCode: 401,
      });
    }

    return toMeResponse(user);
  });

  app.patch('/me', { preHandler: authenticate }, async (request) => {
    const userId = requireUserId(request);

    const input = parseBody<MeUpdateInput>(meUpdateInputSchema, request.body);
    const user = await UserModel.findById(userId)
      .select('_id email name baseCurrency savingsTargetRate riskProfile providers');

    if (!user) {
      throw new ApiError({
        code: 'UNAUTHORIZED',
        message: 'User not found',
        statusCode: 401,
      });
    }

    const previousBaseCurrency = user.baseCurrency ?? null;
    const nextBaseCurrency = input.baseCurrency;

    if (input.name !== undefined) {
      user.name = input.name;
    }

    if (nextBaseCurrency !== undefined) {
      user.baseCurrency = nextBaseCurrency;
    }

    await user.save();

    if (
      nextBaseCurrency !== undefined
      && previousBaseCurrency !== null
      && previousBaseCurrency !== nextBaseCurrency
    ) {
      await synchronizeUserCurrency(user.id, nextBaseCurrency);
    }

    return toMeResponse(user);
  });

  app.post('/me/password', { preHandler: authenticate }, async (request) => {
    const userId = requireUserId(request);
    const input = parseBody<MeChangePasswordInput>(meChangePasswordInputSchema, request.body);

    const user = await UserModel.findById(userId).select('_id providers passwordHash');
    if (!user) {
      throw new ApiError({
        code: 'UNAUTHORIZED',
        message: 'User not found',
        statusCode: 401,
      });
    }

    if ((user.providers?.length ?? 0) > 0) {
      throw new ApiError({
        code: 'PASSWORD_CHANGE_NOT_AVAILABLE',
        message: 'Password change is not available for this account',
        statusCode: 400,
      });
    }

    const isCurrentPasswordValid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!isCurrentPasswordValid) {
      throw new ApiError({
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect',
        statusCode: 401,
      });
    }

    user.passwordHash = await hashPassword(input.newPassword);
    await user.save();

    const revokedAt = new Date();
    await RefreshTokenModel.updateMany(
      {
        userId: user._id,
        revokedAt: null,
        expiresAt: { $gt: revokedAt },
      },
      {
        $set: { revokedAt },
      },
    );

    return logoutResponseSchema.parse({ ok: true });
  });

  app.get('/me/preferences', { preHandler: authenticate }, async (request) => {
    const userId = requireUserId(request);

    const user = await UserModel.findById(userId).select('_id savingsTargetRate riskProfile notificationsEnabled');

    if (!user) {
      throw new ApiError({
        code: 'UNAUTHORIZED',
        message: 'User not found',
        statusCode: 401,
      });
    }

    return toMePreferencesResponse(user);
  });

  app.patch('/me/preferences', { preHandler: authenticate }, async (request) => {
    const userId = requireUserId(request);

    const input = parseBody<MePreferencesUpdateInput>(mePreferencesUpdateInputSchema, request.body);
    const update: Record<string, unknown> = {};

    if (input.savingsTargetRate !== undefined) {
      update.savingsTargetRate = input.savingsTargetRate;
    }

    if (input.riskProfile !== undefined) {
      update.riskProfile = input.riskProfile;
    }

    if (input.notificationsEnabled !== undefined) {
      update.notificationsEnabled = input.notificationsEnabled;
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true },
    ).select('_id savingsTargetRate riskProfile notificationsEnabled');

    if (!user) {
      throw new ApiError({
        code: 'UNAUTHORIZED',
        message: 'User not found',
        statusCode: 401,
      });
    }

    return toMePreferencesResponse(user);
  });
}
