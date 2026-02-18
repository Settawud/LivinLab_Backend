import { Schema, model } from "mongoose";

// Districts collection
const DistrictSchema = new Schema(
  {
    district_id: { type: Number, index: true },
    province_id: { type: Number, index: true },
    name_th: { type: String, trim: true },
    name_en: { type: String, trim: true },
  },
  { collection: "districts" }
);

export const District = model("District", DistrictSchema);

