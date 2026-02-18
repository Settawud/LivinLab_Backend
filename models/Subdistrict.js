import { Schema, model } from "mongoose";

// Subdistricts collection
const SubdistrictSchema = new Schema(
  {
    subdistrict_id: { type: Number, index: true },
    district_id: { type: Number, index: true },
    postcode: { type: String, trim: true },
    name_th: { type: String, trim: true },
    name_en: { type: String, trim: true },
  },
  { collection: "subdistricts" }
);

export const Subdistrict = model("Subdistrict", SubdistrictSchema);