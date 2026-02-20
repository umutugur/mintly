import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const splitSchema = new Schema({
    memberId: {
        type: String,
        required: true,
        trim: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
}, {
    _id: false,
    id: false,
    versionKey: false,
});
const groupExpenseSchema = new Schema({
    groupId: {
        type: Schema.Types.ObjectId,
        ref: 'Group',
        required: true,
        index: true,
    },
    paidByMemberId: {
        type: String,
        required: true,
        trim: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
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
    splits: {
        type: [splitSchema],
        required: true,
        default: [],
    },
    settledAt: {
        type: Date,
        required: false,
        default: null,
        index: true,
    },
}, {
    timestamps: true,
    versionKey: false,
});
groupExpenseSchema.index({ groupId: 1, createdAt: -1 });
groupExpenseSchema.index({ groupId: 1, settledAt: 1, createdAt: -1 });
export const GroupExpenseModel = mongoose.models.GroupExpense || model('GroupExpense', groupExpenseSchema);
