import mongoose, { type HydratedDocument, type InferSchemaType } from 'mongoose';

const { Schema, model } = mongoose;

const authProviderSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ['google', 'apple'],
      required: true,
      trim: true,
    },
    uid: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
  },
  {
    _id: false,
    id: false,
  },
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: false,
      trim: true,
      default: null,
    },
    firebaseUid: {
      type: String,
      required: false,
      trim: true,
      default: undefined,
    },
    providers: {
      type: [authProviderSchema],
      required: true,
      default: [],
    },
    baseCurrency: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: null,
    },
    savingsTargetRate: {
      type: Number,
      required: true,
      min: 0,
      max: 80,
      default: 20,
    },
    riskProfile: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    notificationsEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Only enforce firebaseUid uniqueness when the value exists as a string.
userSchema.index(
  { firebaseUid: 1 },
  { unique: true, partialFilterExpression: { firebaseUid: { $type: 'string' } } },
);

// Ensures each OAuth provider UID maps to a single user (prevents cross-user account takeover).
userSchema.index(
  { 'providers.provider': 1, 'providers.uid': 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { 'providers.uid': { $type: 'string' } },
  },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = mongoose.models.User || model<User>('User', userSchema);
