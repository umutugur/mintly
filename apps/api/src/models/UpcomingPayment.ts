import mongoose, { type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

const { Schema, model } = mongoose;

const upcomingPaymentMetaSchema = new Schema(
  {
    vendor: {
      type: String,
      required: false,
      trim: true,
      maxlength: 160,
      default: null,
    },
    invoiceNo: {
      type: String,
      required: false,
      trim: true,
      maxlength: 120,
      default: null,
    },
    rawText: {
      type: String,
      required: false,
      trim: true,
      maxlength: 6000,
      default: null,
    },
    detectedCurrency: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: null,
    },
  },
  {
    _id: false,
    id: false,
  },
);

const upcomingPaymentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    type: {
      type: String,
      enum: ['bill', 'rent', 'subscription', 'debt', 'other'],
      required: true,
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
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['upcoming', 'paid', 'skipped'],
      required: true,
      default: 'upcoming',
      index: true,
    },
    source: {
      type: String,
      enum: ['ocr', 'template', 'manual'],
      required: true,
      default: 'manual',
    },
    linkedTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      required: false,
      default: null,
    },
    recurringTemplateId: {
      type: Schema.Types.ObjectId,
      required: false,
      default: null,
    },
    meta: {
      type: upcomingPaymentMetaSchema,
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

upcomingPaymentSchema.index({ userId: 1, status: 1, dueDate: 1 });
upcomingPaymentSchema.index({ userId: 1, dueDate: 1 });

export interface UpcomingPayment extends InferSchemaType<typeof upcomingPaymentSchema> {
  userId: Types.ObjectId;
  linkedTransactionId: Types.ObjectId | null;
  recurringTemplateId: Types.ObjectId | null;
}

export type UpcomingPaymentDocument = HydratedDocument<UpcomingPayment>;

export const UpcomingPaymentModel =
  mongoose.models.UpcomingPayment || model<UpcomingPayment>('UpcomingPayment', upcomingPaymentSchema);
