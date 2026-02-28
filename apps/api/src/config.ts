import { z } from 'zod';

export interface RuntimeConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  apiName: string;
  port: number;
  mongoUri: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  accessTtlMin: number;
  refreshTtlDays: number;
  cronSecret: string;
  corsOrigins: string[];
  advisorProvider: 'cloudflare' | 'onysoft';
  cloudflareAuthToken: string | null;
  cloudflareAccountId: string | null;
  cloudflareAiModel: string;
  cloudflareStrictMode: boolean;
  cloudflareHttpTimeoutMs: number;
  cloudflareMaxAttempts: number;
  onysoftApiKey: string | null;
  onysoftModel: string;
  onysoftBaseUrl: string;
  geminiApiKey: string | null;
  geminiModel: string;
  googleOauthClientIds: string[];
  appleOauthClientIds: string[];
}

const apiName = 'Montly API';
const defaultDevCorsOrigins = [
  'http://localhost:19006',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
];

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    MONGODB_URI: z
      .string()
      .trim()
      .min(1, 'MONGODB_URI is required')
      .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must be a valid MongoDB connection string'),
    JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
    ACCESS_TTL_MIN: z.coerce.number().int().min(1).max(24 * 60).default(15),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    CRON_SECRET: z.string().trim().optional(),
    CORS_ORIGINS: z.string().trim().optional(),
    ADVISOR_PROVIDER: z.enum(['cloudflare', 'onysoft']).default('cloudflare'),
    ADVISOR_CLOUDFLARE_API_TOKEN: z.string().trim().optional(),
    ADVISOR_CLOUDFLARE_ACCOUNT_ID: z.string().trim().optional(),
    ADVISOR_CLOUDFLARE_MODEL: z.string().trim().min(1).optional(),
    ADVISOR_CLOUDFLARE_STRICT: z.coerce.boolean().optional(),
    ONYSOFT_API_KEY: z.string().trim().optional(),
    ONYSOFT_MODEL: z.string().trim().min(1).default('meta-llama/llama-3.3-70b-instruct:free'),
    ONYSOFT_BASE_URL: z.string().trim().url().default('https://api.onysoft.com'),
    CLOUDFLARE_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),
    CLOUDFLARE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
    GEMINI_API_KEY: z.string().trim().optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().trim().optional(),
    GEMINI_MODEL: z.string().trim().min(1).default('gemini-1.5-flash'),
    GOOGLE_OAUTH_CLIENT_IDS: z.string().trim().optional(),
    APPLE_OAUTH_CLIENT_IDS: z.string().trim().optional(),
  })
  .superRefine((env, ctx) => {
    const isProduction = env.NODE_ENV === 'production';

    if (isProduction) {
      if (!env.CRON_SECRET || env.CRON_SECRET.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CRON_SECRET'],
          message: 'CRON_SECRET is required in production',
        });
      } else if (env.CRON_SECRET.trim().length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CRON_SECRET'],
          message: 'CRON_SECRET must be at least 16 characters in production',
        });
      }

      if (!env.CORS_ORIGINS || env.CORS_ORIGINS.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'CORS_ORIGINS is required in production',
        });
      }
    }

    if (env.ADVISOR_PROVIDER === 'cloudflare') {
      if (!env.ADVISOR_CLOUDFLARE_API_TOKEN || env.ADVISOR_CLOUDFLARE_API_TOKEN.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADVISOR_CLOUDFLARE_API_TOKEN'],
          message: 'ADVISOR_CLOUDFLARE_API_TOKEN is required when ADVISOR_PROVIDER=cloudflare',
        });
      }

      if (!env.ADVISOR_CLOUDFLARE_ACCOUNT_ID || env.ADVISOR_CLOUDFLARE_ACCOUNT_ID.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADVISOR_CLOUDFLARE_ACCOUNT_ID'],
          message: 'ADVISOR_CLOUDFLARE_ACCOUNT_ID is required when ADVISOR_PROVIDER=cloudflare',
        });
      }

      if (!env.ADVISOR_CLOUDFLARE_MODEL || env.ADVISOR_CLOUDFLARE_MODEL.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADVISOR_CLOUDFLARE_MODEL'],
          message: 'ADVISOR_CLOUDFLARE_MODEL is required when ADVISOR_PROVIDER=cloudflare',
        });
      }
    }
  })
  .transform((env) => {
    const isProduction = env.NODE_ENV === 'production';
    const cloudflareStrictMode = env.ADVISOR_CLOUDFLARE_STRICT ?? isProduction;
    const parsedOrigins = (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    const googleOauthClientIds = (env.GOOGLE_OAUTH_CLIENT_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const appleOauthClientIds = (env.APPLE_OAUTH_CLIENT_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const corsOrigins =
      parsedOrigins.length > 0 ? parsedOrigins : [...defaultDevCorsOrigins];
    const cronSecret =
      env.CRON_SECRET && env.CRON_SECRET.trim().length > 0
        ? env.CRON_SECRET.trim()
        : 'dev-cron-secret';

    const resolvedCloudflareAuthToken = env.ADVISOR_CLOUDFLARE_API_TOKEN?.trim() || null;
    const resolvedCloudflareAccountId = env.ADVISOR_CLOUDFLARE_ACCOUNT_ID?.trim() || null;
    const resolvedOnysoftApiKey = env.ONYSOFT_API_KEY?.trim() || null;
    const resolvedOnysoftBaseUrl = env.ONYSOFT_BASE_URL.replace(/\/+$/, '');
    const resolvedGeminiApiKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim() || null;

    return {
      nodeEnv: env.NODE_ENV,
      isProduction,
      apiName,
      port: env.PORT ?? 4000,
      mongoUri: env.MONGODB_URI,
      jwtAccessSecret: env.JWT_ACCESS_SECRET,
      jwtRefreshSecret: env.JWT_REFRESH_SECRET,
      accessTtlMin: env.ACCESS_TTL_MIN,
      refreshTtlDays: env.REFRESH_TTL_DAYS,
      cronSecret,
      corsOrigins,
      advisorProvider: env.ADVISOR_PROVIDER,
      cloudflareAuthToken: resolvedCloudflareAuthToken,
      cloudflareAccountId: resolvedCloudflareAccountId,
      cloudflareAiModel: env.ADVISOR_CLOUDFLARE_MODEL?.trim() ?? '',
      cloudflareStrictMode,
      cloudflareHttpTimeoutMs: env.CLOUDFLARE_HTTP_TIMEOUT_MS,
      cloudflareMaxAttempts: env.CLOUDFLARE_MAX_ATTEMPTS,
      onysoftApiKey: resolvedOnysoftApiKey,
      onysoftModel: env.ONYSOFT_MODEL,
      onysoftBaseUrl: resolvedOnysoftBaseUrl,
      geminiApiKey: resolvedGeminiApiKey,
      geminiModel: env.GEMINI_MODEL,
      googleOauthClientIds,
      appleOauthClientIds,
    } satisfies RuntimeConfig;
  })
  .superRefine((env, ctx) => {
    if (env.corsOrigins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['corsOrigins'],
        message: 'CORS_ORIGINS must include at least one origin',
      });
    }

    if (env.isProduction && env.corsOrigins.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['corsOrigins'],
        message: 'Wildcard CORS origin (*) is not allowed in production',
      });
    }
  });

let cachedConfig: RuntimeConfig | null = null;

export function getConfig(): RuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'env';
        return `- ${path}: ${issue.message}`;
      })
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}

export function resetConfigForTests(): void {
  cachedConfig = null;
}
