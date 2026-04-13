import mongoose, { type HydratedDocument, type InferSchemaType } from 'mongoose';

const { Schema, model } = mongoose;

const i18nStringSchema = new Schema(
  {
    tr: { type: String, required: true, trim: true, maxlength: 1000 },
    en: { type: String, required: true, trim: true, maxlength: 1000 },
    ru: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { _id: false, id: false },
);

const scheduledNotificationSchema = new Schema(
  {
    title: { type: i18nStringSchema, required: true },
    body: { type: i18nStringSchema, required: true },
    category: {
      type: String,
      required: true,
      enum: ['welcome', 'reminder', 'tip', 'feature', 'motivation', 'winback', 'seasonal'],
    },
    trigger_type: {
      type: String,
      required: true,
      enum: ['days_after_register', 'days_inactive', 'fixed_date', 'recurring'],
    },
    trigger_value: {
      type: Number,
      required: false,
      default: null,
    },
    recurring_pattern: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: null,
    },
    recurring_day: {
      type: Number,
      default: null,
    },
    recurring_hour: {
      type: Number,
      required: true,
      min: 0,
      max: 23,
      default: 9,
    },
    is_active: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  },
);

scheduledNotificationSchema.index({ is_active: 1, trigger_type: 1 });

export type ScheduledNotification = InferSchemaType<typeof scheduledNotificationSchema>;
export type ScheduledNotificationDocument = HydratedDocument<ScheduledNotification>;

export const ScheduledNotificationModel =
  mongoose.models.ScheduledNotification ||
  model<ScheduledNotification>('ScheduledNotification', scheduledNotificationSchema);
