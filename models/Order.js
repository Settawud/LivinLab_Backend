import { Schema, model } from "mongoose";

// A sub-schema for the items in an order
const orderItemSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
    productName: { type: String, required: true },
    discountIsCreated: { type: Boolean, required: true, default: false },
    variant: {
        variantId: { type: Schema.Types.ObjectId, required: true, ref: 'Product.variants' },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true },
        trial: { type: Boolean, required: true },
        variantOption: { type: String, required: true },
        image: { type: String, required: false, default: "" }
    }
}, { _id: false });

// The main Order schema
const orderSchema = new Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    orderNumber: { type: String, required: true, unique: true },
    orderStatus: { type: String, enum: ['Processing', 'Shipped', 'Complete'], required: true, default: 'Processing' },
    subtotalAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, required: true, default: 0, min: 0 },
    discountCode: { type: String},
    installationFee: { type: Number, required: true, default: 0, min: 0 },
    items: {
        type: [orderItemSchema],
        required: true,
        validate: {
            validator: function(v) { return v && v.length > 0; },   
            message: 'An order must contain at least one item.'
        }
    },
    shipping: {
        address: { type: String, required: false, default: "" },
        trackingNumber: { type: String, required: false, default: "" },
        deliveryStatus: { type: String, enum: ['Pending', 'Shipped', 'Delivered'], required: true, default: 'Pending' },
        shippedAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null }
    }
}, { timestamps: true });

// Create and export the Mongoose model
export const Order = model('Order', orderSchema);
