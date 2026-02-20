import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const refreshTokenSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true,
    },
    revokedAt: {
        type: Date,
        required: false,
        default: null,
    },
}, {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
});
export const RefreshTokenModel = mongoose.models.RefreshToken || model('RefreshToken', refreshTokenSchema);
