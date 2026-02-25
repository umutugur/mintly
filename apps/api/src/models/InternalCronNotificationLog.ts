import mongoose, { type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

const { Schema, model } = mongoose;

const internalCronNotificationLogSchema = new Schema(
  {
    task: {
      type: String,
      enum: ['upcoming_due_24h', 'inactive_user_7d'],
      required: true,
      trim: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
      unique: true,
      index: true,
    },
    sentAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
  },
  {
    versionKey: false,
  },
);

internalCronNotificationLogSchema.index({ task: 1, userId: 1, sentAt: -1 });

export interface InternalCronNotificationLog
  extends InferSchemaType<typeof internalCronNotificationLogSchema> {
  userId: Types.ObjectId;
}

export type InternalCronNotificationLogDocument = HydratedDocument<InternalCronNotificationLog>;

export const InternalCronNotificationLogModel =
  mongoose.models.InternalCronNotificationLog ||
  model<InternalCronNotificationLog>('InternalCronNotificationLog', internalCronNotificationLogSchema);
