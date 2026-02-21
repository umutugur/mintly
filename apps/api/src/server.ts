import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { healthResponseSchema } from '@mintly/shared';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';

import { getConfig } from './config.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { ApiError, toErrorPayload } from './errors.js';
import { verifyCloudflareModelExists } from './lib/ai/cloudflare.js';
import { registerAccountRoutes } from './routes/accounts.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerAdvisorRoutes } from './routes/advisor.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBudgetRoutes } from './routes/budgets.js';
import { registerCategoryRoutes } from './routes/categories.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerExportRoutes } from './routes/export.js';
import { registerGroupRoutes } from './routes/groups.js';
import { registerMeRoute } from './routes/me.js';
import { registerRecurringRoutes } from './routes/recurring.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerTransactionRoutes } from './routes/transactions.js';
import { registerTransferRoutes } from './routes/transfers.js';

import { registerUpcomingPaymentRoutes } from './routes/upcoming-payments.js';

// Cloudflare Workers AI: safe boot behavior.
// We keep this local to server boot so we can avoid crashing dev environments.
const CLOUDFLARE_FALLBACK_MODELS_ALLOWLIST = ['@cf/meta/llama-3.2-3b-instruct'] as const;

interface BuildServerOptions {
  logger?: boolean;
}

function isAllowedOrigin(origin: string | undefined, allowedOrigins: Set<string>): boolean {
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(origin);
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const config = getConfig();
  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.log.info(
    {
      provider: config.advisorProvider,
      model: config.cloudflareAiModel,
    },
    `advisor provider=${config.advisorProvider} model=${config.cloudflareAiModel}`,
  );

  const allowedOrigins = new Set(config.corsOrigins);

  if (config.isProduction) {
    app.register(helmet, {
      global: true,
    });
  }

  app.register(cors, {
    // NOTE: Keep this 2-arg signature to satisfy @fastify/cors typings.
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS policy'), false);
    },
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request: unknown, context: { ttl: number }) => {
      return {
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Retry in ${Math.ceil(context.ttl / 1000)}s`,
        },
      };
    },
  });

  app.addHook('onReady', async () => {
    await connectMongo(config.mongoUri);

    if (config.nodeEnv !== 'test' && config.advisorProvider === 'cloudflare') {
      try {
        const check = await verifyCloudflareModelExists({
          apiToken: config.cloudflareAuthToken as string,
          accountId: config.cloudflareAccountId as string,
          configuredModel: config.cloudflareAiModel,
          timeoutMs: config.cloudflareHttpTimeoutMs,
          onDiagnostic: (diagnostic) => {
            app.log.info(
              {
                diagnostic,
              },
              'cloudflare model check diagnostic',
            );
          },
        });

        if (!check.modelExists) {
          const message = `Configured Cloudflare model is not available: ${config.cloudflareAiModel}`;
          const logData = {
            provider: 'cloudflare',
            configuredModel: config.cloudflareAiModel,
            modelsCount: check.modelsCount,
            latencyMs: check.latencyMs,
          };

          // Never crash non-production due to model availability.
          // Strict mode is configurable; default is strict in production.
          if (config.cloudflareStrictMode) {
            app.log.error(
              {
                ...logData,
                strictMode: true,
              },
              message,
            );
            throw new Error(message);
          }

          const fallbackModel = CLOUDFLARE_FALLBACK_MODELS_ALLOWLIST.find(
            (m) => m !== config.cloudflareAiModel,
          );

          if (fallbackModel) {
            // Best-effort fallback: update env + in-memory config for this process.
            process.env.ADVISOR_CLOUDFLARE_MODEL = fallbackModel;
            (config as unknown as { cloudflareAiModel: string }).cloudflareAiModel = fallbackModel;

            app.log.warn(
              {
                ...logData,
                action: 'fallback_model',
                fallbackModel,
              },
              'cloudflare model unavailable; falling back in non-production',
            );
          } else {
            app.log.warn(
              {
                ...logData,
                action: 'no_fallback_available',
              },
              'cloudflare model unavailable; no fallback configured (continuing in non-production)',
            );
          }
        } else {
          app.log.info(
            {
              provider: 'cloudflare',
              configuredModel: config.cloudflareAiModel,
              latencyMs: check.latencyMs,
            },
            'cloudflare model check passed',
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cloudflare model check failed';
        const logData = {
          provider: 'cloudflare',
          configuredModel: config.cloudflareAiModel,
          error: message,
        };

        if (config.cloudflareStrictMode) {
          app.log.error(
            {
              ...logData,
              strictMode: true,
            },
            'cloudflare model check failed',
          );
          throw error;
        }

        app.log.warn(
          {
            ...logData,
            action: 'model_check_failed',
            startupContinues: true,
          },
          'cloudflare model check failed; continuing in non-production',
        );
      }
    }
  });

  app.addHook('onClose', async () => {
    await disconnectMongo();
  });

  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.requestStartedAt = Date.now();
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const durationMs = request.requestStartedAt
      ? Date.now() - request.requestStartedAt
      : undefined;

    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        userId: request.user?.id ?? null,
        durationMs,
      },
      'request completed',
    );
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ApiError) {
      reply
        .status(error.statusCode)
        .send(toErrorPayload({ code: error.code, message: error.message, details: error.details }));
      return;
    }

    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      const message = config.isProduction ? 'Invalid request' : error.message;
      reply.status(error.statusCode).send(toErrorPayload({ code: 'REQUEST_ERROR', message }));
      return;
    }

    request.log.error({ err: error }, 'unhandled server error');

    reply.status(500).send(
      toErrorPayload({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected server error',
      }),
    );
  });

  app.get('/health', async () => {
    return healthResponseSchema.parse({
      ok: true,
      name: config.apiName,
    });
  });

  registerAuthRoutes(app);
  registerMeRoute(app);
  registerAccountRoutes(app);
  registerCategoryRoutes(app);
  registerTransactionRoutes(app);
  registerTransferRoutes(app);
  registerRecurringRoutes(app);
  registerDashboardRoutes(app);
  registerUpcomingPaymentRoutes(app);
  registerAnalyticsRoutes(app);
  registerAiRoutes(app);
  registerAdvisorRoutes(app);
  registerReportRoutes(app);
  registerBudgetRoutes(app);
  registerGroupRoutes(app);
  registerExportRoutes(app);

  return app;
}
