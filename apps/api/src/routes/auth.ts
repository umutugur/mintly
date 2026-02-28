import {
  authResponseSchema,
  loginInputSchema,
  logoutInputSchema,
  logoutResponseSchema,
  oauthInputSchema,
  refreshInputSchema,
  registerInputSchema,
  type LoginInput,
  type LogoutInput,
  type OauthInput,
  type OauthProvider,
  type RefreshInput,
  type RegisterInput,
} from '@mintly/shared';
import type { FastifyInstance } from 'fastify';
import type { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { authenticate } from '../auth/middleware.js';
import { exchangeGoogleOauthCodeForIdToken, verifyOauthIdToken } from '../auth/oauth.js';
import { ApiError } from '../errors.js';
import { RefreshTokenModel } from '../models/RefreshToken.js';
import type { UserDocument } from '../models/User.js';
import { UserModel } from '../models/User.js';

import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { hashRefreshToken, issueTokenPair, verifyRefreshToken } from '../auth/tokens.js';

const AUTH_RATE_LIMIT = {
  max: 15,
  timeWindow: '1 minute',
} as const;

function parseBody<T>(schema: z.ZodSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      statusCode: 400,
      details: parsed.error.flatten(),
    });
  }

  return parsed.data;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function providerLinked(user: { providers?: Array<{ provider: string; uid: string }> }, provider: OauthProvider, uid: string): boolean {
  return Array.isArray(user.providers)
    ? user.providers.some((item) => item.provider === provider && item.uid === uid)
    : false;
}

async function saveUserWithProviderLink(params: {
  user: UserDocument;
  provider: OauthProvider;
  uid: string;
  preferredName?: string | null;
}) {
  const { user, provider, uid, preferredName } = params;
  const alreadyLinked = providerLinked(user, provider, uid);

  if (!alreadyLinked) {
    user.providers.push({ provider, uid });
  }

  if (!user.name && preferredName) {
    user.name = preferredName;
  }

  try {
    await user.save();
    return user;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) {
      throw error;
    }

    const linkedUser = await UserModel.findOne({
      providers: { $elemMatch: { provider, uid } },
    });

    if (!linkedUser) {
      throw error;
    }

    return linkedUser;
  }
}

async function createSessionForUser(user: {
  id: string;
  _id: Types.ObjectId;
  email: string;
  name?: string | null;
}) {
  // Keep per-user session storage bounded by removing expired refresh tokens.
  await RefreshTokenModel.deleteMany({
    userId: user._id,
    expiresAt: { $lte: new Date() },
  });

  const tokenPair = issueTokenPair({
    userId: user.id,
    email: user.email,
  });

  await RefreshTokenModel.create({
    userId: user._id,
    tokenHash: tokenPair.refreshTokenHash,
    expiresAt: tokenPair.refreshExpiresAt,
  });

  return authResponseSchema.parse({
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
    },
  });
}

async function resolveOauthIdToken(input: OauthInput): Promise<string> {
  if (input.provider === 'google' && process.env.NODE_ENV !== 'production') {
    console.info('[auth][google][oauth-input]', {
      mode:
        typeof input.idToken === 'string' && input.idToken.length > 0
          ? 'id_token'
          : 'authorization_code',
      hasIdToken: typeof input.idToken === 'string' && input.idToken.length > 0,
      hasAuthorizationCode:
        typeof input.authorizationCode === 'string' && input.authorizationCode.length > 0,
      hasCodeVerifier: typeof input.codeVerifier === 'string' && input.codeVerifier.length > 0,
      hasRedirectUri: typeof input.redirectUri === 'string' && input.redirectUri.length > 0,
      clientId: typeof input.clientId === 'string' ? input.clientId : null,
      redirectUri: typeof input.redirectUri === 'string' ? input.redirectUri : null,
    });
  }

  if (typeof input.idToken === 'string' && input.idToken.length > 0) {
    return input.idToken;
  }

  if (input.provider !== 'google') {
    throw new ApiError({
      code: 'OAUTH_TOKEN_INVALID',
      message: 'OAuth token is invalid or expired',
      statusCode: 401,
    });
  }

  return exchangeGoogleOauthCodeForIdToken({
    code: input.authorizationCode as string,
    codeVerifier: input.codeVerifier as string,
    redirectUri: input.redirectUri as string,
    clientId: input.clientId as string,
  });
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post(
    '/auth/register',
    {
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
    },
    async (request, reply) => {
      const input = parseBody<RegisterInput>(registerInputSchema, request.body);
      const email = normalizeEmail(input.email);

      const existing = await UserModel.findOne({ email }).lean();
      if (existing) {
        throw new ApiError({
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists',
          statusCode: 409,
        });
      }

      const passwordHash = await hashPassword(input.password);

      try {
        const user = await UserModel.create({
          email,
          name: input.name?.trim() || null,
          passwordHash,
        });

        const session = await createSessionForUser(user);
        reply.status(201).send(session);
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          throw new ApiError({
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'An account with this email already exists',
            statusCode: 409,
          });
        }

        throw error;
      }
    },
  );

  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
    },
    async (request) => {
      const input = parseBody<LoginInput>(loginInputSchema, request.body);
      const email = normalizeEmail(input.email);

      const user = await UserModel.findOne({ email });
      if (!user) {
        throw new ApiError({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          statusCode: 401,
        });
      }

      const passwordValid = await verifyPassword(user.passwordHash, input.password);
      if (!passwordValid) {
        throw new ApiError({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          statusCode: 401,
        });
      }

      return createSessionForUser(user);
    },
  );

  app.post(
    '/auth/oauth',
    {
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
    },
    async (request, reply) => {
      const input = parseBody<OauthInput>(oauthInputSchema, request.body);
      const idToken = await resolveOauthIdToken(input);
      const identity = await verifyOauthIdToken({
        provider: input.provider,
        idToken,
        nonce: input.nonce,
      });

      let user = await UserModel.findOne({
        providers: { $elemMatch: { provider: identity.provider, uid: identity.uid } },
      });

      if (!user && identity.email) {
        user = await UserModel.findOne({ email: normalizeEmail(identity.email) });
      }

      if (!user && !identity.email) {
        throw new ApiError({
          code: 'OAUTH_EMAIL_REQUIRED',
          message: 'OAuth account email is required for first sign-in',
          statusCode: 400,
        });
      }

      if (!user) {
        const randomPassword = `oauth-${randomUUID()}-${randomUUID()}`;
        const passwordHash = await hashPassword(randomPassword);

        const nameFromToken = identity.name?.trim() || null;
        const nameFromInput = input.name?.trim() || null;
        const preferredName = nameFromInput || nameFromToken;

        try {
          user = await UserModel.create({
            email: normalizeEmail(identity.email as string),
            name: preferredName,
            passwordHash,
            providers: [{ provider: identity.provider, uid: identity.uid }],
          });
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) {
            throw error;
          }

          user = await UserModel.findOne({
            email: normalizeEmail(identity.email as string),
          });

          if (!user) {
            throw error;
          }
        }
      } else {
        user = await saveUserWithProviderLink({
          user,
          provider: identity.provider,
          uid: identity.uid,
          preferredName: input.name?.trim() || identity.name || null,
        });
      }

      const session = await createSessionForUser(user);
      reply.status(200).send(session);
    },
  );

  app.post(
    '/auth/refresh',
    {
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
    },
    async (request) => {
      const input = parseBody<RefreshInput>(refreshInputSchema, request.body);
      const claims = verifyRefreshToken(input.refreshToken);
      const tokenHash = hashRefreshToken(input.refreshToken);

      const currentRefresh = await RefreshTokenModel.findOne({
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });

      if (!currentRefresh || currentRefresh.userId.toString() !== claims.sub) {
        throw new ApiError({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or expired',
          statusCode: 401,
        });
      }

      const user = await UserModel.findById(currentRefresh.userId);
      if (!user) {
        throw new ApiError({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or expired',
          statusCode: 401,
        });
      }

      currentRefresh.revokedAt = new Date();
      await currentRefresh.save();

      return createSessionForUser(user);
    },
  );

  app.post(
    '/auth/logout',
    {
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
    },
    async (request) => {
      const input = parseBody<LogoutInput>(logoutInputSchema, request.body);
      const claims = verifyRefreshToken(input.refreshToken);
      const tokenHash = hashRefreshToken(input.refreshToken);

      const currentRefresh = await RefreshTokenModel.findOne(
        {
          tokenHash,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
      );

      if (!currentRefresh || currentRefresh.userId.toString() !== claims.sub) {
        throw new ApiError({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or expired',
          statusCode: 401,
        });
      }

      currentRefresh.revokedAt = new Date();
      await currentRefresh.save();

      return logoutResponseSchema.parse({
        ok: true,
      });
    },
  );

  app.post(
    '/auth/logout-all',
    {
      preHandler: authenticate,
      config: {
        rateLimit: AUTH_RATE_LIMIT,
      },
    },
    async (request) => {
      if (!request.user) {
        throw new ApiError({
          code: 'UNAUTHORIZED',
          message: 'Unauthorized',
          statusCode: 401,
        });
      }

      const revokedAt = new Date();
      await RefreshTokenModel.updateMany(
        {
          userId: request.user.id,
          revokedAt: null,
          expiresAt: { $gt: revokedAt },
        },
        {
          $set: { revokedAt },
        },
      );

      return logoutResponseSchema.parse({
        ok: true,
      });
    },
  );
}
