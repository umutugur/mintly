import mongoose, { type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

const { Schema, model } = mongoose;

const accountLoanSchema = new Schema(
  {
    borrowedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalRepayable: {
      type: Number,
      required: true,
      min: 0,
    },
    monthlyPayment: {
      type: Number,
      required: true,
      min: 0,
    },
    installmentCount: {
      type: Number,
      required: true,
      min: 1,
      max: 360,
    },
    paymentDay: {
      type: Number,
      required: true,
      min: 1,
      max: 28,
    },
    firstPaymentDate: {
      type: Date,
      required: true,
    },
    paymentAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: false,
      default: null,
    },
    note: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'closed', 'closed_early'],
      required: true,
      default: 'active',
      index: true,
    },
    closedAt: {
      type: Date,
      required: false,
      default: null,
    },
  },
  {
    _id: false,
    id: false,
  },
);

const accountSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: ['cash', 'bank', 'credit', 'debt_lent', 'debt_borrowed', 'loan'],
      required: true,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    openingBalance: {
      type: Number,
      required: true,
      default: 0,
    },
    loan: {
      type: accountLoanSchema,
      required: false,
      default: null,
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

// Serves account list endpoints (active-first by creation time) with soft-delete filtering.
accountSchema.index({ userId: 1, deletedAt: 1, createdAt: -1 });
accountSchema.index({ userId: 1, type: 1, deletedAt: 1, createdAt: -1 });

export interface Account extends InferSchemaType<typeof accountSchema> {
  userId: Types.ObjectId;
}

export type AccountDocument = HydratedDocument<Account>;

export const AccountModel = mongoose.models.Account || model<Account>('Account', accountSchema);
