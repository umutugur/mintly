import mongoose, { type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

const { Schema, model } = mongoose;

const groupMemberSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 320,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
    },
  },
  {
    _id: true,
    id: false,
    versionKey: false,
  },
);

const groupSchema = new Schema(
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
    members: {
      type: [groupMemberSchema],
      required: true,
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

groupSchema.index({ userId: 1, createdAt: -1 });

export interface Group extends InferSchemaType<typeof groupSchema> {
  userId: Types.ObjectId;
}

export type GroupDocument = HydratedDocument<Group>;

export const GroupModel = mongoose.models.Group || model<Group>('Group', groupSchema);
