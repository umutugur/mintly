import mongoose, { type HydratedDocument, type InferSchemaType } from 'mongoose';

const { Schema, model } = mongoose;

const notificationLogSchema = new Schema(
  {
    scheduled_notification_id: {
      type: Schema.Types.ObjectId,
      ref: 'ScheduledNotification',
      required: true,
      index: true,
    },
    sent_at: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
    target_count: { type: Number, required: true, default: 0 },
    success_count: { type: Number, required: true, default: 0 },
    fail_count: { type: Number, required: true, default: 0 },
    skipped_count: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      required: true,
      enum: ['sent', 'partial', 'failed'],
    },
  },
  {
    versionKey: false,
  },
);

notificationLogSchema.index({ sent_at: -1 });
notificationLogSchema.index({ scheduled_notification_id: 1, sent_at: -1 });

export type NotificationLog = InferSchemaType<typeof notificationLogSchema>;
export type NotificationLogDocument = HydratedDocument<NotificationLog>;

export const NotificationLogModel =
  mongoose.models.NotificationLog ||
  model<NotificationLog>('NotificationLog', notificationLogSchema);
