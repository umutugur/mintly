import mongoose, { type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

const { Schema, model } = mongoose;

const recurringRuleSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ['normal', 'transfer'],
      required: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: false,
      default: null,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: false,
      default: null,
    },
    categoryKey: {
      type: String,
      required: false,
      trim: true,
      default: null,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: false,
      default: null,
    },
    fromAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: false,
      default: null,
    },
    toAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: false,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
      default: null,
    },
    cadence: {
      type: String,
      enum: ['weekly', 'monthly'],
      required: true,
    },
    dayOfWeek: {
      type: Number,
      required: false,
      min: 0,
      max: 6,
      default: null,
    },
    dayOfMonth: {
      type: Number,
      required: false,
      min: 1,
      max: 28,
      default: null,
    },
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: false,
      default: null,
    },
    nextRunAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastRunAt: {
      type: Date,
      required: false,
      default: null,
    },
    isPaused: {
      type: Boolean,
      required: true,
      default: false,
    },
    deletedAt: {
      type: Date,
      required: false,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Optimizes due-rule scans for the recurring runner while excluding soft-deleted/paused rules.
recurringRuleSchema.index({ userId: 1, nextRunAt: 1, deletedAt: 1, isPaused: 1 });
// Supports user-facing recurring rule listing/filtering.
recurringRuleSchema.index({ userId: 1, deletedAt: 1, cadence: 1 });

export interface RecurringRule extends InferSchemaType<typeof recurringRuleSchema> {
  userId: Types.ObjectId;
  accountId: Types.ObjectId | null;
  categoryId: Types.ObjectId | null;
  categoryKey: string | null;
  fromAccountId: Types.ObjectId | null;
  toAccountId: Types.ObjectId | null;
}

export type RecurringRuleDocument = HydratedDocument<RecurringRule>;

export const RecurringRuleModel =
  mongoose.models.RecurringRule || model<RecurringRule>('RecurringRule', recurringRuleSchema);
