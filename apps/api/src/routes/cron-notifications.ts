import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Types } from 'mongoose';

import { getConfig } from '../config.js';
import { ApiError } from '../errors.js';
import { pickLatestExpoPushToken, sendExpoPushNotifications } from '../lib/expo-push.js';
import { NotificationLogModel } from '../models/NotificationLog.js';
import { ScheduledNotificationModel } from '../models/ScheduledNotification.js';
import { UserModel } from '../models/User.js';

type SupportedLanguage = 'tr' | 'en' | 'ru';

interface I18nString {
  tr: string;
  en: string;
  ru: string;
}

interface NotificationSnapshot {
  _id: Types.ObjectId;
  title: I18nString;
  body: I18nString;
  category: string;
  trigger_type: 'days_after_register' | 'days_inactive' | 'fixed_date' | 'recurring';
  trigger_value: number | null;
  recurring_pattern: 'daily' | 'weekly' | 'monthly' | null;
  recurring_day: number | null;
  recurring_hour: number;
  is_active: boolean;
}

interface UserSnapshot {
  _id: Types.ObjectId;
  language?: string | null;
  baseCurrency?: string | null;
  notificationsEnabled: boolean;
  createdAt: Date;
  lastActiveAt?: Date | null;
  expoPushTokens?: Array<{
    token?: string | null;
    updatedAt?: Date | null;
    lastUsedAt?: Date | null;
  }>;
}

function readBearerToken(request: FastifyRequest): string | null {
  const raw = request.headers['authorization'];
  if (typeof raw !== 'string') {
    return null;
  }
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? (match[1] ?? null) : null;
}

function requireCronAuth(request: FastifyRequest): void {
  const provided = readBearerToken(request);
  if (!provided || provided !== getConfig().cronSecret) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'Invalid cron secret',
      statusCode: 401,
    });
  }
}

function resolveLanguage(value: unknown): SupportedLanguage {
  if (typeof value !== 'string') return 'tr';
  const n = value.trim().toLowerCase();
  if (n.startsWith('en')) return 'en';
  if (n.startsWith('ru')) return 'ru';
  return 'tr';
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function matchesTrigger(
  notification: NotificationSnapshot,
  user: UserSnapshot,
  now: Date,
): boolean {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  switch (notification.trigger_type) {
    case 'days_after_register': {
      if (notification.trigger_value == null) return false;
      const registerDay = new Date(
        Date.UTC(
          user.createdAt.getUTCFullYear(),
          user.createdAt.getUTCMonth(),
          user.createdAt.getUTCDate(),
        ),
      );
      const targetDay = new Date(registerDay.getTime() + notification.trigger_value * 86400000);
      return isSameDay(targetDay, today);
    }

    case 'days_inactive': {
      if (notification.trigger_value == null) return false;
      const lastActive = user.lastActiveAt ?? user.createdAt;
      const lastActiveDay = new Date(
        Date.UTC(
          lastActive.getUTCFullYear(),
          lastActive.getUTCMonth(),
          lastActive.getUTCDate(),
        ),
      );
      const diffDays = Math.floor((today.getTime() - lastActiveDay.getTime()) / 86400000);
      return diffDays >= notification.trigger_value;
    }

    case 'fixed_date': {
      if (notification.trigger_value == null) return false;
      return today.getUTCDate() === notification.trigger_value;
    }

    case 'recurring': {
      const pattern = notification.recurring_pattern;
      if (!pattern) return false;

      if (pattern === 'daily') return true;

      if (pattern === 'weekly') {
        return notification.recurring_day != null &&
          today.getUTCDay() === notification.recurring_day;
      }

      if (pattern === 'monthly') {
        return notification.recurring_day != null &&
          today.getUTCDate() === notification.recurring_day;
      }

      return false;
    }

    default:
      return false;
  }
}

export function registerCronNotificationRoutes(app: FastifyInstance): void {
  app.post(
    '/api/cron/send-notifications',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      requireCronAuth(request);

      const now = new Date();
      const currentHour = now.getUTCHours();

      const notifications = await ScheduledNotificationModel.find({ is_active: true }).lean<NotificationSnapshot[]>();

      let totalSent = 0;
      let totalSkipped = 0;
      let totalFailed = 0;

      for (const notification of notifications) {
        if (notification.recurring_hour !== currentHour) {
          continue;
        }

        // Fetch all active users with push tokens
        const users = await UserModel.find({
          notificationsEnabled: true,
          'expoPushTokens.0': { $exists: true },
        })
          .select('_id language baseCurrency notificationsEnabled createdAt lastActiveAt expoPushTokens')
          .lean<UserSnapshot[]>();

        const messages: Array<{ token: string; title: string; body: string; userId: string }> = [];
        let skipped = 0;

        for (const user of users) {
          if (!matchesTrigger(notification, user, now)) {
            skipped += 1;
            continue;
          }

          const pushToken = pickLatestExpoPushToken(user.expoPushTokens);
          if (!pushToken) {
            skipped += 1;
            continue;
          }

          const lang = resolveLanguage(user.language);
          let title = notification.title[lang];
          let body = notification.body[lang];

          if (user.baseCurrency) {
            title = title.replace(/\{currency\}/g, user.baseCurrency);
            body = body.replace(/\{currency\}/g, user.baseCurrency);
          }

          messages.push({ token: pushToken, title, body, userId: user._id.toString() });
        }

        totalSkipped += skipped;

        if (messages.length === 0) {
          continue;
        }

        const result = await sendExpoPushNotifications(
          messages.map(({ token, title, body }) => ({ token, title, body })),
        );

        const successCount = result.acceptedCount;
        const failCount = messages.length - successCount;

        totalSent += successCount;
        totalFailed += failCount;

        let status: 'sent' | 'partial' | 'failed';
        if (successCount === messages.length) {
          status = 'sent';
        } else if (successCount === 0) {
          status = 'failed';
        } else {
          status = 'partial';
        }

        await NotificationLogModel.create({
          scheduled_notification_id: notification._id,
          sent_at: now,
          target_count: messages.length,
          success_count: successCount,
          fail_count: failCount,
          skipped_count: skipped,
          status,
        });
      }

      return {
        sent: totalSent,
        skipped: totalSkipped,
        failed: totalFailed,
      };
    },
  );
}
