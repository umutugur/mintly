import { normalizeApiError, type NormalizedApiError } from '@mintly/shared';

const API_CODE_TO_KEY: Record<string, string> = {
  AI_PROVIDER_ERROR: 'errors.api.AI_PROVIDER_ERROR',
  AI_PROVIDER_TIMEOUT: 'errors.api.AI_PROVIDER_TIMEOUT',
  AI_PROVIDER_UNREACHABLE: 'errors.api.AI_PROVIDER_UNREACHABLE',
  AI_SERVICE_NOT_CONFIGURED: 'errors.api.AI_SERVICE_NOT_CONFIGURED',
  ADVISOR_REGENERATE_COOLDOWN: 'errors.api.ADVISOR_REGENERATE_COOLDOWN',
  ADVISOR_PROVIDER_RATE_LIMIT: 'errors.api.ADVISOR_PROVIDER_RATE_LIMIT',
  ADVISOR_PROVIDER_TIMEOUT: 'errors.api.ADVISOR_PROVIDER_TIMEOUT',
  ADVISOR_PROVIDER_INVALID_REQUEST: 'errors.api.ADVISOR_PROVIDER_INVALID_REQUEST',
  ADVISOR_PROVIDER_RATE_LIMITED: 'errors.api.ADVISOR_PROVIDER_RATE_LIMIT',
  ADVISOR_PROVIDER_REQUEST_INVALID: 'errors.api.ADVISOR_PROVIDER_INVALID_REQUEST',
  ACCOUNT_NOT_FOUND: 'errors.api.ACCOUNT_NOT_FOUND',
  API_REQUEST_FAILED: 'errors.api.API_REQUEST_FAILED',
  BASE_CURRENCY_NOT_SET: 'errors.api.BASE_CURRENCY_NOT_SET',
  BASE_CURRENCY_MISMATCH: 'errors.api.BASE_CURRENCY_MISMATCH',
  CATEGORY_NOT_FOUND: 'errors.api.CATEGORY_NOT_FOUND',
  EMAIL_ALREADY_EXISTS: 'errors.api.EMAIL_ALREADY_EXISTS',
  FORBIDDEN: 'errors.api.FORBIDDEN',
  INVALID_CREDENTIALS: 'errors.api.INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'errors.api.INVALID_REFRESH_TOKEN',
  INVALID_RESPONSE_PAYLOAD: 'errors.api.INVALID_RESPONSE_PAYLOAD',
  NETWORK_ERROR: 'errors.api.NETWORK_ERROR',
  NOT_FOUND: 'errors.api.NOT_FOUND',
  OAUTH_EMAIL_NOT_VERIFIED: 'errors.api.OAUTH_EMAIL_NOT_VERIFIED',
  OAUTH_EMAIL_REQUIRED: 'errors.api.OAUTH_EMAIL_REQUIRED',
  OAUTH_NONCE_INVALID: 'errors.api.OAUTH_NONCE_INVALID',
  OAUTH_PROVIDER_NOT_CONFIGURED: 'errors.api.OAUTH_PROVIDER_NOT_CONFIGURED',
  OAUTH_PROVIDER_NOT_SUPPORTED: 'errors.api.OAUTH_PROVIDER_NOT_SUPPORTED',
  OAUTH_TOKEN_INVALID: 'errors.api.OAUTH_TOKEN_INVALID',
  PASSWORD_CHANGE_NOT_AVAILABLE: 'errors.api.PASSWORD_CHANGE_NOT_AVAILABLE',
  RATE_LIMITED: 'errors.api.RATE_LIMITED',
  REQUEST_TIMEOUT: 'errors.api.REQUEST_TIMEOUT',
  SERVER_UNREACHABLE: 'errors.api.SERVER_UNREACHABLE',
  UNAUTHORIZED: 'errors.api.UNAUTHORIZED',
  UPCOMING_PAYMENT_NOT_FOUND: 'errors.api.UPCOMING_PAYMENT_NOT_FOUND',
  UNKNOWN_ERROR: 'errors.api.UNKNOWN_ERROR',
};

interface UiApiError extends NormalizedApiError {
  translationKey: string;
}

function normalizeCode(normalized: NormalizedApiError): string {
  if (normalized.code && normalized.code !== 'UNKNOWN_ERROR') {
    return normalized.code;
  }

  const message = normalized.message.toLowerCase();
  if (message.includes('network request failed')) {
    return 'SERVER_UNREACHABLE';
  }

  return normalized.code;
}

export function normalizeApiErrorForUi(error: unknown): UiApiError {
  const normalized = normalizeApiError(error);
  const code = normalizeCode(normalized);

  return {
    ...normalized,
    code,
    translationKey: API_CODE_TO_KEY[code] ?? API_CODE_TO_KEY.UNKNOWN_ERROR,
  };
}
