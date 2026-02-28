import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Types } from 'mongoose';

import { getConfig } from '../config.js';
import { ApiError } from '../errors.js';
import { InternalCronNotificationLogModel } from '../models/InternalCronNotificationLog.js';
import { UpcomingPaymentModel } from '../models/UpcomingPayment.js';
import { UserModel } from '../models/User.js';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;

type SupportedLanguage = 'tr' | 'en' | 'ru';

interface CronTaskMetrics {
  sent: number;
  skipped: number;
  failed: number;
}

interface CronTaskResult extends CronTaskMetrics {
  ok: boolean;
  durationMs: number;
}

interface CronUserSnapshot {
  _id: Types.ObjectId;
  name?: string | null;
  firebaseUid?: string | null;
  updatedAt: Date;
  language?: string | null;
}

interface UpcomingPaymentSnapshot {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  amount: number;
  currency: string;
  dueDate: Date;
}

const localeByLanguage: Record<SupportedLanguage, string> = {
  tr: 'tr-TR',
  en: 'en-US',
  ru: 'ru-RU',
};

const upcomingReminderCopy: Record<
  SupportedLanguage,
  {
    title: string;
    body: (input: { paymentTitle: string; amountLabel: string; dueDateLabel: string }) => string;
  }
> = {
  tr: {
    title: 'Yaklaşan ödeme hatırlatması',
    body: ({ paymentTitle, amountLabel, dueDateLabel }) =>
      `${paymentTitle} için ${amountLabel} tutarlı ödeme 24 saat içinde (${dueDateLabel}) vadesine ulaşıyor.`,
  },
  en: {
    title: 'Upcoming payment reminder',
    body: ({ paymentTitle, amountLabel, dueDateLabel }) =>
      `${paymentTitle} for ${amountLabel} is due within 24 hours (${dueDateLabel}).`,
  },
  ru: {
    title: 'Напоминание о платеже',
    body: ({ paymentTitle, amountLabel, dueDateLabel }) =>
      `Платеж ${paymentTitle} на сумму ${amountLabel} наступит в течение 24 часов (${dueDateLabel}).`,
  },
};

const inactiveUserCopy: Record<
  SupportedLanguage,
  {
    title: string;
    body: string;
  }
> = {
  tr: {
    title: 'Montly seni bekliyor',
    body: '7 gündür hareket yok. Finans akışını güncellemek için uygulamaya geri dön.',
  },
  en: {
    title: 'Montly is waiting for you',
    body: 'No activity for 7 days. Come back and update your financial flow.',
  },
  ru: {
    title: 'Montly ждет вас',
    body: 'Нет активности 7 дней. Вернитесь в приложение и обновите финансы.',
  },
};

function readCronSecret(request: FastifyRequest): string | null {
  const raw = request.headers['x-cron-secret'];
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }

  return typeof raw === 'string' ? raw : null;
}

function requireCronSecret(request: FastifyRequest): void {
  const provided = readCronSecret(request);
  if (!provided || provided !== getConfig().cronSecret) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'Invalid cron secret',
      statusCode: 401,
    });
  }
}

function resolveLanguage(value: unknown): SupportedLanguage {
  if (typeof value !== 'string') {
    return 'tr';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('en')) {
    return 'en';
  }
  if (normalized.startsWith('ru')) {
    return 'ru';
  }

  return 'tr';
}

function isExpoPushToken(value: string): boolean {
  return /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(value.trim());
}

function formatMoney(value: number, currency: string, language: SupportedLanguage): string {
  return new Intl.NumberFormat(localeByLanguage[language], {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDueDate(value: Date, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(localeByLanguage[language], {
    day: '2-digit',
    month: 'short',
  }).format(value);
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown';
}

async function sendExpoPushNotification(input: {
  token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Promise<boolean> {
  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: input.token,
      title: input.title,
      body: input.body,
      sound: 'default',
      data: input.data,
    }),
  });

  if (!response.ok) {
    return false;
  }

  const payload = await response.json().catch(() => null) as
    | {
        data?:
          | {
              status?: string;
            }
          | Array<{
              status?: string;
            }>;
      }
    | null;

  if (!payload || payload.data === undefined) {
    return true;
  }

  if (Array.isArray(payload.data)) {
    return payload.data.every((item) => item?.status !== 'error');
  }

  return payload.data.status !== 'error';
}

async function runUpcomingPaymentRemindersTask(
  app: FastifyInstance,
  now: Date,
): Promise<CronTaskMetrics> {
  const metrics: CronTaskMetrics = { sent: 0, skipped: 0, failed: 0 };
  const horizon = new Date(now.getTime() + ONE_DAY_MS);
  const dayKey = now.toISOString().slice(0, 10);

  const upcomingPayments = await UpcomingPaymentModel.find({
    status: 'upcoming',
    dueDate: {
      $gt: now,
      $lte: horizon,
    },
  })
    .select('_id userId title amount currency dueDate')
    .lean<UpcomingPaymentSnapshot[]>();

  if (upcomingPayments.length === 0) {
    return metrics;
  }

  const uniqueUserIds = Array.from(new Set(upcomingPayments.map((item) => item.userId.toString())));
  const users = await UserModel.find({
    _id: { $in: uniqueUserIds },
    notificationsEnabled: true,
    firebaseUid: { $exists: true, $nin: [null, ''] },
  })
    .select('_id name firebaseUid language')
    .lean<CronUserSnapshot[]>();

  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  const dedupeKeyByPaymentId = new Map(
    upcomingPayments.map((payment) => [payment._id.toString(), `upcoming:${payment._id.toString()}:${dayKey}`]),
  );

  const existingLogEntries = await InternalCronNotificationLogModel.find({
    key: { $in: Array.from(dedupeKeyByPaymentId.values()) },
  })
    .select('key')
    .lean<Array<{ key: string }>>();

  const existingKeys = new Set(existingLogEntries.map((entry) => entry.key));

  for (const payment of upcomingPayments) {
    const paymentId = payment._id.toString();
    const dedupeKey = dedupeKeyByPaymentId.get(paymentId);
    if (!dedupeKey || existingKeys.has(dedupeKey)) {
      metrics.skipped += 1;
      continue;
    }

    const user = userById.get(payment.userId.toString());
    if (!user || typeof user.firebaseUid !== 'string' || !isExpoPushToken(user.firebaseUid)) {
      metrics.skipped += 1;
      continue;
    }

    const language = resolveLanguage(user.language);
    const copy = upcomingReminderCopy[language];

    try {
      const sent = await sendExpoPushNotification({
        token: user.firebaseUid,
        title: copy.title,
        body: copy.body({
          paymentTitle: payment.title,
          amountLabel: formatMoney(payment.amount, payment.currency, language),
          dueDateLabel: formatDueDate(new Date(payment.dueDate), language),
        }),
        data: {
          type: 'upcoming_payment_reminder',
          paymentId,
          dueDate: new Date(payment.dueDate).toISOString(),
        },
      });

      if (!sent) {
        metrics.failed += 1;
        continue;
      }

      await InternalCronNotificationLogModel.create({
        task: 'upcoming_due_24h',
        userId: user._id,
        key: dedupeKey,
        sentAt: now,
      });

      existingKeys.add(dedupeKey);
      metrics.sent += 1;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        metrics.skipped += 1;
        continue;
      }

      metrics.failed += 1;
      app.log.warn(
        {
          task: 'upcoming_due_24h',
          userId: user._id.toString(),
          paymentId,
          error: toSafeErrorMessage(error),
        },
        'internal cron upcoming reminder failed',
      );
    }
  }

  return metrics;
}

async function runInactiveUserReminderTask(
  app: FastifyInstance,
  now: Date,
): Promise<CronTaskMetrics> {
  const metrics: CronTaskMetrics = { sent: 0, skipped: 0, failed: 0 };
  const inactiveThreshold = new Date(now.getTime() - 7 * ONE_DAY_MS);
  const recentWindowStart = new Date(now.getTime() - INACTIVE_REMINDER_WINDOW_MS);
  const dedupeBucket = Math.floor(now.getTime() / INACTIVE_REMINDER_WINDOW_MS);

  const inactiveUsers = await UserModel.find({
    notificationsEnabled: true,
    firebaseUid: { $exists: true, $nin: [null, ''] },
    updatedAt: { $lte: inactiveThreshold },
  })
    .select('_id name firebaseUid language updatedAt')
    .lean<CronUserSnapshot[]>();

  if (inactiveUsers.length === 0) {
    return metrics;
  }

  const inactiveUserIds = inactiveUsers.map((user) => user._id);
  const recentLogs = await InternalCronNotificationLogModel.find({
    task: 'inactive_user_7d',
    userId: { $in: inactiveUserIds },
    sentAt: { $gte: recentWindowStart },
  })
    .select('userId')
    .lean<Array<{ userId: Types.ObjectId }>>();

  const recentlyNotifiedUserIds = new Set(recentLogs.map((entry) => entry.userId.toString()));

  for (const user of inactiveUsers) {
    const userId = user._id.toString();
    if (recentlyNotifiedUserIds.has(userId)) {
      metrics.skipped += 1;
      continue;
    }

    if (typeof user.firebaseUid !== 'string' || !isExpoPushToken(user.firebaseUid)) {
      metrics.skipped += 1;
      continue;
    }

    const language = resolveLanguage(user.language);
    const copy = inactiveUserCopy[language];
    const dedupeKey = `inactive:${userId}:${dedupeBucket}`;

    try {
      const sent = await sendExpoPushNotification({
        token: user.firebaseUid,
        title: copy.title,
        body: copy.body,
        data: {
          type: 'inactive_user_reminder',
          userId,
        },
      });

      if (!sent) {
        metrics.failed += 1;
        continue;
      }

      await InternalCronNotificationLogModel.create({
        task: 'inactive_user_7d',
        userId: user._id,
        key: dedupeKey,
        sentAt: now,
      });

      recentlyNotifiedUserIds.add(userId);
      metrics.sent += 1;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        metrics.skipped += 1;
        continue;
      }

      metrics.failed += 1;
      app.log.warn(
        {
          task: 'inactive_user_7d',
          userId,
          error: toSafeErrorMessage(error),
        },
        'internal cron inactive reminder failed',
      );
    }
  }

  return metrics;
}

async function runWarmRenderTask(app: FastifyInstance): Promise<CronTaskMetrics> {
  const response = await app.inject({
    method: 'GET',
    url: '/health',
  });

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return {
      sent: 1,
      skipped: 0,
      failed: 0,
    };
  }

  throw new Error(`health check failed with status ${response.statusCode}`);
}

async function runCronTask(
  request: FastifyRequest,
  taskName: string,
  runner: () => Promise<CronTaskMetrics>,
): Promise<CronTaskResult> {
  const startedAt = Date.now();

  try {
    const result = await runner();
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    };
  } catch (error) {
    request.log.warn(
      {
        task: taskName,
        error: toSafeErrorMessage(error),
      },
      'internal cron task failed',
    );

    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      sent: 0,
      skipped: 0,
      failed: 1,
    };
  }
}

export function registerInternalCronRoutes(app: FastifyInstance): void {
  app.post(
    '/internal/cron/run',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      requireCronSecret(request);

      const startedAt = Date.now();
      const now = new Date();

      const upcomingPaymentReminders = await runCronTask(
        request,
        'upcoming_due_24h',
        async () => runUpcomingPaymentRemindersTask(app, now),
      );
      const inactiveUsers = await runCronTask(
        request,
        'inactive_user_7d',
        async () => runInactiveUserReminderTask(app, now),
      );
      const warmRender = await runCronTask(
        request,
        'warm_render',
        async () => runWarmRenderTask(app),
      );

      return {
        ok: true as const,
        ranAt: now.toISOString(),
        durationMs: Date.now() - startedAt,
        tasks: {
          upcomingPaymentReminders,
          inactiveUsers,
          warmRender,
        },
      };
    },
  );
}
