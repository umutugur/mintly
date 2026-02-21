import { createHash } from 'node:crypto';

import { type OauthProvider } from '@mintly/shared';
import { errors, jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';

import { getConfig } from '../config.js';
import { ApiError } from '../errors.js';

export interface VerifyOauthTokenInput {
  provider: OauthProvider;
  idToken: string;
  nonce?: string;
}

export interface VerifiedOauthIdentity {
  provider: OauthProvider;
  uid: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const APPLE_ISSUER = 'https://appleid.apple.com';

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 120);
}

function claimIsTruthy(value: unknown): boolean {
  if (value === true) {
    return true;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return false;
}

function requiredAudiences(provider: OauthProvider): string[] {
  const config = getConfig();
  const audiences =
    provider === 'google' ? config.googleOauthClientIds : config.appleOauthClientIds;

  if (audiences.length === 0) {
    throw new ApiError({
      code: 'OAUTH_PROVIDER_NOT_CONFIGURED',
      message: `${provider} OAuth is not configured`,
      statusCode: 503,
    });
  }

  return audiences;
}

function hashSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function validateAppleNonce(payload: JWTPayload, rawNonce: string | undefined): void {
  if (!rawNonce) {
    return;
  }

  const claimNonce = typeof payload.nonce === 'string' ? payload.nonce : '';
  if (!claimNonce) {
    throw new ApiError({
      code: 'OAUTH_NONCE_INVALID',
      message: 'OAuth nonce is missing or invalid',
      statusCode: 401,
    });
  }

  const nonceHash = hashSha256(rawNonce);
  if (claimNonce !== rawNonce && claimNonce !== nonceHash) {
    throw new ApiError({
      code: 'OAUTH_NONCE_INVALID',
      message: 'OAuth nonce is missing or invalid',
      statusCode: 401,
    });
  }
}

function parseProviderPayload(provider: OauthProvider, payload: JWTPayload): VerifiedOauthIdentity {
  const uid = typeof payload.sub === 'string' ? payload.sub : '';
  if (!uid) {
    throw new ApiError({
      code: 'OAUTH_TOKEN_INVALID',
      message: 'OAuth token is invalid or expired',
      statusCode: 401,
    });
  }

  const email = normalizeEmail(payload.email);
  const name = normalizeName(payload.name);
  const emailVerified = claimIsTruthy((payload as JWTPayload & { email_verified?: unknown }).email_verified);

  if (provider === 'google' && email && !emailVerified) {
    throw new ApiError({
      code: 'OAUTH_EMAIL_NOT_VERIFIED',
      message: 'OAuth email is not verified',
      statusCode: 401,
    });
  }

  return {
    provider,
    uid,
    email,
    name,
    emailVerified,
  };
}

export async function verifyOauthIdToken(input: VerifyOauthTokenInput): Promise<VerifiedOauthIdentity> {
  const audiences = requiredAudiences(input.provider);

  try {
    if (input.provider === 'google') {
      const verified = await jwtVerify(input.idToken, googleJwks, {
        issuer: GOOGLE_ISSUERS,
        audience: audiences,
      });

      return parseProviderPayload('google', verified.payload);
    }

    const verified = await jwtVerify(input.idToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: audiences,
    });

    validateAppleNonce(verified.payload, input.nonce);
    return parseProviderPayload('apple', verified.payload);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof errors.JOSEError || error instanceof Error) {
      throw new ApiError({
        code: 'OAUTH_TOKEN_INVALID',
        message: 'OAuth token is invalid or expired',
        statusCode: 401,
      });
    }

    throw error;
  }
}
