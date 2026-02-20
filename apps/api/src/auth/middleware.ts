import type { FastifyReply, FastifyRequest } from 'fastify';

import { ApiError } from '../errors.js';

import { verifyAccessToken } from './tokens.js';

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

  request.user = {
    id: claims.sub,
    email: claims.email,
  };
}
