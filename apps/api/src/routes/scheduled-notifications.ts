import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';

import { requireAdmin } from '../auth/middleware.js';
import { ApiError } from '../errors.js';
import { NotificationLogModel } from '../models/NotificationLog.js';
import { ScheduledNotificationModel } from '../models/ScheduledNotification.js';
import { parseBody, parseObjectId, parseQuery } from './utils.js';

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(25);

const dateOnlyStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD');

const i18nFieldSchema = z.object({
  tr: z.string().trim().min(1).max(1000),
  en: z.string().trim().min(1).max(1000),
  ru: z.string().trim().min(1).max(1000),
});

const scheduledNotificationBodySchema = z.object({
  title: i18nFieldSchema,
  body: i18nFieldSchema,
  category: z.enum(['welcome', 'reminder', 'tip', 'feature', 'motivation', 'winback', 'seasonal']),
  trigger_type: z.enum(['days_after_register', 'days_inactive', 'fixed_date', 'recurring']),
  trigger_value: z.number().nullable().default(null),
  recurring_pattern: z.enum(['daily', 'weekly', 'monthly']).nullable().default(null),
  recurring_day: z.number().int().nullable().default(null),
  recurring_hour: z.number().int().min(0).max(23).default(9),
  is_active: z.boolean().default(true),
});

const scheduledNotificationPatchSchema = z.object({
  title: i18nFieldSchema.optional(),
  body: i18nFieldSchema.optional(),
  category: z.enum(['welcome', 'reminder', 'tip', 'feature', 'motivation', 'winback', 'seasonal']).optional(),
  trigger_type: z.enum(['days_after_register', 'days_inactive', 'fixed_date', 'recurring']).optional(),
  trigger_value: z.number().nullable().optional(),
  recurring_pattern: z.enum(['daily', 'weekly', 'monthly']).nullable().optional(),
  recurring_day: z.number().int().nullable().optional(),
  recurring_hour: z.number().int().min(0).max(23).optional(),
  is_active: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

const logsQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  from: dateOnlyStringSchema.optional(),
  to: dateOnlyStringSchema.optional(),
  category: z
    .enum(['welcome', 'reminder', 'tip', 'feature', 'motivation', 'winback', 'seasonal'])
    .optional(),
});

const csvRowSchema = z.object({
  title_tr: z.string().trim().min(1).max(1000),
  title_en: z.string().trim().min(1).max(1000),
  title_ru: z.string().trim().min(1).max(1000),
  body_tr: z.string().trim().min(1).max(1000),
  body_en: z.string().trim().min(1).max(1000),
  body_ru: z.string().trim().min(1).max(1000),
  category: z.enum(['welcome', 'reminder', 'tip', 'feature', 'motivation', 'winback', 'seasonal']),
  trigger_type: z.enum(['days_after_register', 'days_inactive', 'fixed_date', 'recurring']),
  trigger_value: z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }, z.number().nullable().default(null)),
  recurring_pattern: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.enum(['daily', 'weekly', 'monthly']).nullable().default(null),
  ),
  recurring_day: z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }, z.number().int().nullable().default(null)),
  recurring_hour: z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return 9;
    const n = Number(v);
    return Number.isNaN(n) ? 9 : n;
  }, z.number().int().min(0).max(23).default(9)),
});

function parseCsvRows(
  text: string,
): Array<{ row: number; data: z.infer<typeof csvRowSchema> } | { row: number; error: string }> {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  const sep = lines[0]!.includes('\t') ? '\t' : ',';
  const headers = lines[0]!.split(sep).map((h) => h.trim());

  const results: Array<
    { row: number; data: z.infer<typeof csvRowSchema> } | { row: number; error: string }
  > = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(sep);
    const raw: Record<string, string> = {};
    for (const [index, header] of headers.entries()) {
      raw[header] = (cols[index] ?? '').trim();
    }

    const parsed = csvRowSchema.safeParse(raw);
    if (parsed.success) {
      results.push({ row: i + 1, data: parsed.data });
    } else {
      results.push({
        row: i + 1,
        error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      });
    }
  }

  return results;
}

export function registerScheduledNotificationRoutes(app: FastifyInstance): void {
  app.addHook('preHandler', async (request, reply) => {
    await requireAdmin(request, reply);
  });

  // GET /admin/scheduled-notifications
  app.get('/admin/scheduled-notifications', async (request) => {
    const { page, limit } = parseQuery(listQuerySchema, request.query);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      ScheduledNotificationModel.find().sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      ScheduledNotificationModel.countDocuments(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });

  // POST /admin/scheduled-notifications
  app.post('/admin/scheduled-notifications', async (request, reply) => {
    const body = parseBody(scheduledNotificationBodySchema, request.body);
    const doc = await ScheduledNotificationModel.create(body);
    reply.status(201);
    return doc.toObject();
  });

  // POST /admin/scheduled-notifications/upload (must be before /:id routes)
  app.post('/admin/scheduled-notifications/upload', async (request) => {
    const raw = request.body as Record<string, unknown>;

    // JSON upload: array in body
    if (Array.isArray(raw)) {
      const errors: string[] = [];
      let created = 0;
      let skipped = 0;

      for (const [index, item] of (raw as unknown[]).entries()) {
        const parsed = scheduledNotificationBodySchema.safeParse(item);
        if (!parsed.success) {
          errors.push(
            `Item ${index + 1}: ${parsed.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ')}`,
          );
          skipped += 1;
          continue;
        }

        await ScheduledNotificationModel.create(parsed.data);
        created += 1;
      }

      return { created, skipped, errors };
    }

    // CSV/TXT upload: text in body.text field
    const textField = typeof raw['text'] === 'string' ? raw['text'] : null;
    if (!textField) {
      throw new ApiError({
        code: 'VALIDATION_ERROR',
        message: 'Body must be a JSON array or { text: "..." } with CSV/TXT content',
        statusCode: 400,
      });
    }

    const rows = parseCsvRows(textField);
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const result of rows) {
      if ('error' in result) {
        errors.push(`Row ${result.row}: ${result.error}`);
        skipped += 1;
        continue;
      }

      const { data } = result;
      await ScheduledNotificationModel.create({
        title: { tr: data.title_tr, en: data.title_en, ru: data.title_ru },
        body: { tr: data.body_tr, en: data.body_en, ru: data.body_ru },
        category: data.category,
        trigger_type: data.trigger_type,
        trigger_value: data.trigger_value,
        recurring_pattern: data.recurring_pattern,
        recurring_day: data.recurring_day,
        recurring_hour: data.recurring_hour,
        is_active: true,
      });
      created += 1;
    }

    return { created, skipped, errors };
  });

  // PATCH /admin/scheduled-notifications/:id
  app.patch('/admin/scheduled-notifications/:id', async (request) => {
    const { id } = request.params as { id: string };
    const objectId = parseObjectId(id, 'id');
    const body = parseBody(scheduledNotificationPatchSchema, request.body);

    const doc = await ScheduledNotificationModel.findByIdAndUpdate(
      objectId,
      { $set: body },
      { new: true },
    ).lean();

    if (!doc) {
      throw new ApiError({
        code: 'NOT_FOUND',
        message: 'Scheduled notification not found',
        statusCode: 404,
      });
    }

    return doc;
  });

  // DELETE /admin/scheduled-notifications/:id
  app.delete('/admin/scheduled-notifications/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const objectId = parseObjectId(id, 'id');

    const doc = await ScheduledNotificationModel.findByIdAndDelete(objectId).lean();

    if (!doc) {
      throw new ApiError({
        code: 'NOT_FOUND',
        message: 'Scheduled notification not found',
        statusCode: 404,
      });
    }

    reply.status(204);
    return '';
  });

  // GET /admin/scheduled-notifications/:id/logs
  app.get('/admin/scheduled-notifications/:id/logs', async (request) => {
    const { id } = request.params as { id: string };
    const objectId = parseObjectId(id, 'id');
    const { page, limit } = parseQuery(listQuerySchema, request.query);
    const skip = (page - 1) * limit;

    const filter = { scheduled_notification_id: objectId };
    const [items, total] = await Promise.all([
      NotificationLogModel.find(filter).sort({ sent_at: -1 }).skip(skip).limit(limit).lean(),
      NotificationLogModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });

  // GET /admin/notification-logs
  app.get('/admin/notification-logs', async (request) => {
    const { page, limit, from, to, category } = parseQuery(logsQuerySchema, request.query);
    const skip = (page - 1) * limit;

    // Build date filter
    const dateFilter: Record<string, unknown> = {};
    if (from) {
      dateFilter['$gte'] = new Date(`${from}T00:00:00.000Z`);
    }
    if (to) {
      dateFilter['$lte'] = new Date(`${to}T23:59:59.999Z`);
    }

    const logFilter: Record<string, unknown> = {};
    if (Object.keys(dateFilter).length > 0) {
      logFilter['sent_at'] = dateFilter;
    }

    // Category filter: join with ScheduledNotification
    let notifIds: Types.ObjectId[] | null = null;
    if (category) {
      const notifs = await ScheduledNotificationModel.find({ category })
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>();
      notifIds = notifs.map((n) => n._id);
      logFilter['scheduled_notification_id'] = { $in: notifIds };
    }

    const [logs, total] = await Promise.all([
      NotificationLogModel.find(logFilter)
        .sort({ sent_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('scheduled_notification_id', 'title category')
        .lean(),
      NotificationLogModel.countDocuments(logFilter),
    ]);

    // Monthly summary stats
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const monthlyStats = await NotificationLogModel.aggregate([
      { $match: { sent_at: { $gte: monthStart } } },
      {
        $group: {
          _id: null,
          totalSent: { $sum: 1 },
          totalSuccess: { $sum: '$success_count' },
          totalTarget: { $sum: '$target_count' },
        },
      },
    ]);

    const stats = monthlyStats[0] ?? { totalSent: 0, totalSuccess: 0, totalTarget: 0 };
    const avgSuccessRate =
      stats.totalTarget > 0 ? Math.round((stats.totalSuccess / stats.totalTarget) * 100) : 0;

    return {
      items: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        monthlySent: stats.totalSent,
        monthlyAvgSuccessRate: avgSuccessRate,
        monthlyTotalReached: stats.totalSuccess,
      },
    };
  });
}
