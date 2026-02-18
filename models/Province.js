import { Schema, model } from "mongoose";

// Provinces collection
const ProvinceSchema = new Schema(
  {
    province_id: { type: Number, index: true },
    name_th: { type: String, trim: true },
    name_en: { type: String, trim: true },
  },
  { collection: "provinces" }
);

export const Province = model("Province", ProvinceSchema);

