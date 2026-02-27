import mongoose, { type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

const { Schema, model } = mongoose;

const transactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: false,
      default: null,
      index: true,
    },
    categoryKey: {
      type: String,
      required: false,
      trim: true,
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: true,
    },
    kind: {
      type: String,
      enum: ['normal', 'transfer'],
      required: true,
      default: 'normal',
      index: true,
    },
    transferGroupId: {
      type: Schema.Types.ObjectId,
      required: false,
      default: null,
    },
    transferDirection: {
      type: String,
      enum: ['out', 'in'],
      required: false,
      default: null,
    },
    relatedAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: false,
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    description: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
      default: null,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
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

// Primary transaction list/feed index per user with soft-delete filtering.
transactionSchema.index({ userId: 1, deletedAt: 1, occurredAt: -1 });
// Speeds account-scoped filters used by transactions listing and dashboard rollups.
transactionSchema.index({ userId: 1, accountId: 1, deletedAt: 1 });
transactionSchema.index({ userId: 1, deletedAt: 1, accountId: 1, occurredAt: -1 });
// Speeds category-scoped analytics and budget aggregations.
transactionSchema.index({ userId: 1, deletedAt: 1, categoryId: 1, occurredAt: -1 });
transactionSchema.index({ userId: 1, deletedAt: 1, categoryKey: 1, occurredAt: -1 });
transactionSchema.index({ userId: 1, deletedAt: 1, kind: 1, occurredAt: -1 });
// Makes transfer pair lookups efficient when reconciling by group.
transactionSchema.index({ transferGroupId: 1 });

export interface Transaction extends InferSchemaType<typeof transactionSchema> {
  userId: Types.ObjectId;
  accountId: Types.ObjectId;
  categoryId: Types.ObjectId | null;
  categoryKey: string | null;
  transferGroupId: Types.ObjectId | null;
  relatedAccountId: Types.ObjectId | null;
}

export type TransactionDocument = HydratedDocument<Transaction>;

export const TransactionModel =
  mongoose.models.Transaction || model<Transaction>('Transaction', transactionSchema);
