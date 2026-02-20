import { createHash, randomUUID } from 'node:crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { getConfig } from '../config.js';
import { ApiError } from '../errors.js';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  type: 'access';
}

export interface RefreshTokenClaims {
  sub: string;
  email: string;
  type: 'refresh';
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}

function getString(input: unknown): string | undefined {
  return typeof input === 'string' ? input : undefined;
}

export function issueTokenPair(params: { userId: string; email: string }): TokenPair {
  const config = getConfig();

  const accessPayload: AccessTokenClaims = {
    sub: params.userId,
    email: params.email,
    type: 'access',
  };

  const refreshPayload: RefreshTokenClaims = {
    sub: params.userId,
    email: params.email,
    type: 'refresh',
    jti: randomUUID(),
  };

  const accessToken = jwt.sign(accessPayload, config.jwtAccessSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.accessTtlMin}m`,
  });

  const refreshToken = jwt.sign(refreshPayload, config.jwtRefreshSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.refreshTtlDays}d`,
  });

  const refreshExpiresAt = new Date(
    Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000,
  );

  return {
    accessToken,
    refreshToken,
    refreshTokenHash: hashRefreshToken(refreshToken),
    refreshExpiresAt,
  };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const config = getConfig();

  try {
    const decoded = jwt.verify(token, config.jwtAccessSecret, {
      algorithms: ['HS256'],
    });

    const payload = decoded as JwtPayload;
    const sub = getString(payload.sub);
    const email = getString(payload.email);
    const type = getString(payload.type);

    if (!sub || !email || type !== 'access') {
      throw new Error('Invalid token payload');
    }

    return {
      sub,
      email,
      type: 'access',
    };
  } catch {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired access token',
      statusCode: 401,
    });
  }
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  const config = getConfig();

  try {
    const decoded = jwt.verify(token, config.jwtRefreshSecret, {
      algorithms: ['HS256'],
    });

    const payload = decoded as JwtPayload;
    const sub = getString(payload.sub);
    const email = getString(payload.email);
    const type = getString(payload.type);
    const jti = getString(payload.jti);

    if (!sub || !email || !jti || type !== 'refresh') {
      throw new Error('Invalid token payload');
    }

    return {
      sub,
      email,
      jti,
      type: 'refresh',
    };
  } catch {
    throw new ApiError({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid or expired refresh token',
      statusCode: 401,
    });
  }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
