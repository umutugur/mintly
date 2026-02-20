import mongoose, { type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

const { Schema, model } = mongoose;

const budgetSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    month: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      index: true,
    },
    limitAmount: {
      type: Number,
      required: true,
      min: 0,
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

// Supports month-scoped budget list queries with soft-delete filtering.
budgetSchema.index({ userId: 1, month: 1, deletedAt: 1 });
// Enforces one active budget per (user, month, category) while allowing soft-deleted history.
budgetSchema.index(
  { userId: 1, month: 1, categoryId: 1, deletedAt: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export interface Budget extends InferSchemaType<typeof budgetSchema> {
  userId: Types.ObjectId;
  categoryId: Types.ObjectId;
}

export type BudgetDocument = HydratedDocument<Budget>;

export const BudgetModel = mongoose.models.Budget || model<Budget>('Budget', budgetSchema);
