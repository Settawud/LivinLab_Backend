import { Schema, model } from "mongoose";

const colorSchema = new Schema(
  {
    name_th: { type: String, required: true, trim: true },
    name_en: { type: String, required: true, trim: true },
    hex: { type: String, required: true, match: /^#?[0-9a-fA-F]{6}$/ },
  },
  { timestamps: true }
);

export const Color = model("Color", colorSchema);

