import mongoose, { type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

const { Schema, model } = mongoose;

const recurringRunLogSchema = new Schema(
  {
    ruleId: {
      type: Schema.Types.ObjectId,
      ref: 'RecurringRule',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },
    generatedTransactionIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Guarantees idempotency for a rule at a specific scheduled execution slot.
recurringRunLogSchema.index({ ruleId: 1, scheduledAt: 1 }, { unique: true });
// Helps operators inspect execution history per user.
recurringRunLogSchema.index({ userId: 1, scheduledAt: -1 });

export interface RecurringRunLog extends InferSchemaType<typeof recurringRunLogSchema> {
  ruleId: Types.ObjectId;
  userId: Types.ObjectId;
  generatedTransactionIds: Types.ObjectId[];
}

export type RecurringRunLogDocument = HydratedDocument<RecurringRunLog>;

export const RecurringRunLogModel =
  mongoose.models.RecurringRunLog || model<RecurringRunLog>('RecurringRunLog', recurringRunLogSchema);
