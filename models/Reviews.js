import { Schema, model } from "mongoose";

const reviewsSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
  },
  { timestamps: true }
);

// Prevent duplicate review by the same user on the same product
reviewsSchema.index({ productId: 1, userId: 1 }, { unique: true });

export const reviews = model("reviews", reviewsSchema);
