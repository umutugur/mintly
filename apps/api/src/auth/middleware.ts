import type { FastifyReply, FastifyRequest } from 'fastify';

import { ApiError } from '../errors.js';
import { UserModel } from '../models/User.js';

import { verifyAccessToken } from './tokens.js';

const LAST_ACTIVE_THROTTLE_MS = 6 * 60 * 60 * 1000;

function extractBearerToken(authorization: string | undefined): string {
  if (!authorization) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'Missing Authorization header',
      statusCode: 401,
    });
  }

  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'Authorization header must be Bearer <token>',
      statusCode: 401,
    });
  }

  return token;
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  const claims = verifyAccessToken(token);
  const user = await UserModel.findById(claims.sub).select('_id email role lastActiveAt');

  if (!user) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'User not found',
      statusCode: 401,
    });
  }

  const now = new Date();
  const lastActiveAt = user.lastActiveAt instanceof Date ? user.lastActiveAt : null;
  const shouldRefreshLastActive =
    !lastActiveAt || now.getTime() - lastActiveAt.getTime() >= LAST_ACTIVE_THROTTLE_MS;

  if (shouldRefreshLastActive) {
    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          lastActiveAt: now,
        },
      },
    );
  }

  request.user = {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    await authenticate(request, reply);
  }

  if (!request.user || request.user.role !== 'admin') {
    throw new ApiError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
      statusCode: 403,
    });
  }
}
