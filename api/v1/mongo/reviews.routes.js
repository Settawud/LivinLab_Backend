import express from "express";
import jwtBearer from "../../../middleware/jwtBearer.js";
import { Product } from "../../../models/Product.js";
import { reviews as Review } from "../../../models/Reviews.js";
import mongoose from "mongoose";

const router = express.Router();

// GET /api/v1/mongo/reviews/product/:productId
router.get("/product/:productId", async (req, res, next) => {
  try {
    const items = await Review.find({ productId: req.params.productId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: items.length, items });
  } catch (err) { next(err); }
});

// GET /api/v1/mongo/reviews/me (requires auth)
router.get("/me", jwtBearer, async (req, res, next) => {
  try {
    const items = await Review.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: items.length, items });
  } catch (err) { next(err); }
});

// POST /api/v1/mongo/reviews (requires auth)
router.post("/", jwtBearer, async (req, res, next) => {
  try {
    const { productId, name, rating, comment } = req.body || {};
    if (!productId || !Number(rating)) {
      return res.status(400).json({ error: true, message: "productId and rating required" });
    }
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });
    try {
      const created = await Review.create({
        productId,
        userId: req.user.id,
        name: name,
        rating: Number(rating),
        comment: comment || "",
      });
      res.status(201).json({ success: true, item: created });
    } catch (e) {
      if (e?.code === 11000) {
        return res.status(409).json({ error: true, message: "You already reviewed this product" });
      }
      throw e;
    }
  } catch (err) { next(err); }
});

export default router;

// DELETE /api/v1/mongo/reviews/:reviewId (owner or admin)
router.delete("/:reviewId", jwtBearer, async (req, res, next) => {
  try {
    const me = req.user;
    const rev = await Review.findById(req.params.reviewId);
    if (!rev) return res.status(404).json({ error: true, message: "Not found" });
    const isOwner = String(rev.userId) === String(me.id);
    const isAdmin = me?.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ error: true, message: "Forbidden" });
    await Review.deleteOne({ _id: rev._id });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/v1/mongo/reviews/avg?ids=ID1,ID2,...
// POST /api/v1/mongo/reviews/avg { ids: ["ID1","ID2",...] }
router.get("/avg", async (req, res, next) => {
  try {
    const raw = String(req.query?.ids || "").trim();
    if (!raw) return res.status(400).json({ error: true, message: "ids query required (comma-separated)" });
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const objIds = ids.filter((s) => mongoose.isValidObjectId(s)).map((s) => new mongoose.Types.ObjectId(s));
    if (!objIds.length) return res.status(400).json({ error: true, message: "No valid ids provided" });
    const agg = await Review.aggregate([
      { $match: { productId: { $in: objIds } } },
      { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    const map = Object.fromEntries(agg.map((a) => [String(a._id), { avg: a.avg, count: a.count }]));
    // Ensure every requested id appears (fill zeros)
    const items = ids.map((id) => ({ productId: id, avg: map[id]?.avg || 0, count: map[id]?.count || 0 }));
    res.json({ success: true, count: items.length, items });
  } catch (err) { next(err); }
});

router.post("/avg", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const objIds = ids.filter((s) => mongoose.isValidObjectId(s)).map((s) => new mongoose.Types.ObjectId(s));
    if (!objIds.length) return res.status(400).json({ error: true, message: "ids array required" });
    const agg = await Review.aggregate([
      { $match: { productId: { $in: objIds } } },
      { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    const map = Object.fromEntries(agg.map((a) => [String(a._id), { avg: a.avg, count: a.count }]));
    const items = ids.map((id) => ({ productId: id, avg: map[id]?.avg || 0, count: map[id]?.count || 0 }));
    res.json({ success: true, count: items.length, items });
  } catch (err) { next(err); }
});
