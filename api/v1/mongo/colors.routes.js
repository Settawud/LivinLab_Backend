import express from "express";
import jwtBearer from "../../../middleware/jwtBearer.js";
import requireRole from "../../../middleware/requireRole.js";
import { Color } from "../../../models/Color.js";

const router = express.Router();

// GET /api/v1/mongo/colors
router.get("/", async (_req, res, next) => {
  try {
    const items = await Color.find().lean();
    res.json({ success: true, count: items.length, items });
  } catch (err) { next(err); }
});

// GET /api/v1/mongo/colors/:colorId
router.get("/:colorId", async (req, res, next) => {
  try {
    const item = await Color.findById(req.params.colorId).lean();
    if (!item) return res.status(404).json({ error: true, message: "Not found" });
    res.json({ success: true, item });
  } catch (err) { next(err); }
});

//POST /api/v1/mongo/colors (auth)
router.post("/", jwtBearer, requireRole("admin"), async (req, res, next) => {
  try {
    const created = await Color.create(req.body || {});
    res.status(201).json({ success: true, item: created });
  } catch (err) { next(err); }
});


// PATCH /api/v1/mongo/colors/:colorId (auth)
router.patch("/:colorId", jwtBearer, requireRole("admin"), async (req, res, next) => {
  try {
    const updated = await Color.findByIdAndUpdate(
      req.params.colorId,
      { $set: req.body || {} },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: true, message: "Not found" });
    res.json({ success: true, item: updated });
  } catch (err) { next(err); }
});

// DELETE /api/v1/mongo/colors/:colorId (auth)
router.delete("/:colorId", jwtBearer, requireRole("admin"), async (req, res, next) => {
  try {
    const deleted = await Color.findByIdAndDelete(req.params.colorId);
    if (!deleted) return res.status(404).json({ error: true, message: "Not found" });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
