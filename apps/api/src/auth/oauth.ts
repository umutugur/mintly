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

export interface ExchangeGoogleOauthCodeInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
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
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function logGoogleOauthDev(stage: string, payload: Record<string, unknown>): void {
  if (getConfig().isProduction) {
    return;
  }

  console.info(`[auth][google][${stage}]`, payload);
}

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
      logGoogleOauthDev('verify-start', {
        acceptedAudiences: audiences,
        issuer: GOOGLE_ISSUERS,
      });

      const verified = await jwtVerify(input.idToken, googleJwks, {
        issuer: GOOGLE_ISSUERS,
        audience: audiences,
      });

      logGoogleOauthDev('verify-success', {
        tokenAud:
          typeof verified.payload.aud === 'string' || Array.isArray(verified.payload.aud)
            ? verified.payload.aud
            : null,
        tokenAzp: typeof verified.payload.azp === 'string' ? verified.payload.azp : null,
        hasEmail: typeof verified.payload.email === 'string' && verified.payload.email.trim().length > 0,
        hasSub: typeof verified.payload.sub === 'string' && verified.payload.sub.trim().length > 0,
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

    if (input.provider === 'google') {
      logGoogleOauthDev('verify-failed', {
        acceptedAudiences: audiences,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
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

export async function exchangeGoogleOauthCodeForIdToken(
  input: ExchangeGoogleOauthCodeInput,
): Promise<string> {
  const allowedClientIds = requiredAudiences('google');

  const normalizedClientId = input.clientId.trim();
  const normalizedRedirectUri = input.redirectUri.trim();
  const normalizedCode = input.code.trim();
  const normalizedCodeVerifier = input.codeVerifier.trim();

  logGoogleOauthDev('exchange-start', {
    clientId: normalizedClientId,
    redirectUri: normalizedRedirectUri,
    codeLength: normalizedCode.length,
    codeVerifierLength: normalizedCodeVerifier.length,
    allowedClientIds,
    clientIdAllowed: allowedClientIds.includes(normalizedClientId),
    hasConfiguredGoogleClientSecret: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
    sendsClientSecret: false,
  });

  if (!allowedClientIds.includes(normalizedClientId)) {
    throw new ApiError({
      code: 'OAUTH_CLIENT_INVALID',
      message: 'OAuth client is not allowed',
      statusCode: 401,
    });
  }

  const body = new URLSearchParams({
    code: normalizedCode,
    client_id: normalizedClientId,
    code_verifier: normalizedCodeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: normalizedRedirectUri,
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  } catch {
    throw new ApiError({
      code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
      message: 'OAuth token exchange failed',
      statusCode: 502,
    });
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const upstreamError = typeof payload?.error === 'string' ? payload.error : '';
    const upstreamErrorDescription =
      typeof payload?.error_description === 'string' ? payload.error_description : '';

    logGoogleOauthDev('exchange-response', {
      ok: false,
      status: response.status,
      error: upstreamError || null,
      errorDescription: upstreamErrorDescription || null,
      hasIdToken: false,
      hasAccessToken: typeof payload?.access_token === 'string' && payload.access_token.length > 0,
    });

    const isInvalidCodeError =
      upstreamError === 'invalid_grant' || upstreamError === 'invalid_request';

    throw new ApiError({
      code: isInvalidCodeError ? 'OAUTH_CODE_INVALID' : 'OAUTH_TOKEN_EXCHANGE_FAILED',
      message: isInvalidCodeError ? 'OAuth code is invalid or expired' : 'OAuth token exchange failed',
      statusCode: isInvalidCodeError ? 401 : 502,
    });
  }

  const idToken = typeof payload?.id_token === 'string' ? payload.id_token : '';
  logGoogleOauthDev('exchange-response', {
    ok: true,
    status: response.status,
    error: null,
    errorDescription: null,
    hasIdToken: idToken.length > 0,
    hasAccessToken: typeof payload?.access_token === 'string' && payload.access_token.length > 0,
    tokenType: typeof payload?.token_type === 'string' ? payload.token_type : null,
  });

  if (!idToken) {
    throw new ApiError({
      code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
      message: 'OAuth token exchange failed',
      statusCode: 502,
    });
  }

  return idToken;
}
