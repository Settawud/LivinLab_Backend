import { Schema, model } from "mongoose";

// Item in a cart
const cartItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "Product.variants", required: true },
    quantity: { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

// Main Cart schema
const cartSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

export const Cart = model("Cart", cartSchema);
