import { Schema, model } from "mongoose";

const userDiscountSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: false, default: null },
    code: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ["percentage", "fixed"], required: true },
    value: { type: Number, required: true },
    maxDiscount: { type: Number },
    minOrderAmount: { type: Number },
    usageLimit: { type: Number, required: true, default: 1 },
    usedCount: { type: Number, required: true, default: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isGlobal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userDiscountSchema.index({ code: 1, user_id: 1 }, { unique: true });

export const userDiscounts = model("userDiscounts", userDiscountSchema);