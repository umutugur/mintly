import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const categorySchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        index: true,
        default: null,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    key: {
        type: String,
        required: false,
        trim: true,
        lowercase: true,
        maxlength: 120,
        default: null,
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        required: true,
    },
    color: {
        type: String,
        required: true,
        trim: true,
        match: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/,
    },
    icon: {
        type: String,
        required: false,
        trim: true,
        maxlength: 64,
        default: null,
    },
    isSystem: {
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
}, {
    timestamps: true,
    versionKey: false,
});
categorySchema.index({ userId: 1, deletedAt: 1, type: 1, name: 1 });
categorySchema.index({ userId: 1, key: 1 }, {
    unique: true,
    partialFilterExpression: {
        key: { $type: 'string' },
        deletedAt: null,
    },
});
export const CategoryModel = mongoose.models.Category || model('Category', categorySchema);
