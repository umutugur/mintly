import mongoose, { type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

const { Schema, model } = mongoose;

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
      enum: ['cash', 'bank', 'credit'],
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

export interface Account extends InferSchemaType<typeof accountSchema> {
  userId: Types.ObjectId;
}

export type AccountDocument = HydratedDocument<Account>;

export const AccountModel = mongoose.models.Account || model<Account>('Account', accountSchema);
