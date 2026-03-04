import {
  notificationRegisterTokenInputSchema,
  notificationRegisterTokenResponseSchema,
  type NotificationRegisterTokenInput,
} from '@mintly/shared';
import type { FastifyInstance } from 'fastify';

import { authenticate } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { registerUserExpoPushToken } from '../lib/push-token-registration.js';

import { parseBody, requireUser } from './utils.js';

export function registerNotificationRoutes(app: FastifyInstance): void {
  app.post('/notifications/register-token', { preHandler: authenticate }, async (request) => {
    const authUser = requireUser(request);
    const input = parseBody<NotificationRegisterTokenInput>(
      notificationRegisterTokenInputSchema,
      request.body,
    );

    if (input.userId !== authUser.id) {
      throw new ApiError({
        code: 'FORBIDDEN',
        message: 'Push token can only be registered for the authenticated user',
        statusCode: 403,
      });
    }

    console.log('PUSH TOKEN REGISTER', {
      userId: input.userId,
      token: input.expoPushToken,
      platform: input.platform,
    });

    const result = await registerUserExpoPushToken({
      userId: input.userId,
      expoPushToken: input.expoPushToken,
      platform: input.platform,
      device: input.device,
      deviceInfo: input.deviceInfo,
    });

    return notificationRegisterTokenResponseSchema.parse({
      ok: true,
      userId: input.userId,
      tokensCount: result.tokensCount,
      reusedExisting: result.reusedExisting,
      tokenUpdatedAt: result.tokenUpdatedAt.toISOString(),
    });
  });
}
