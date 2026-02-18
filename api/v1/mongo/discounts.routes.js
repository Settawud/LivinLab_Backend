import express from "express";
import jwtBearer from "../../../middleware/jwtBearer.js";
import { userDiscounts as UserDiscount } from "../../../models/Discounts.js";
import requireRole from "../../../middleware/requireRole.js";
import { User } from "../../../models/User.js"; // Add this import

const router = express.Router();

router.use(jwtBearer);

// GET /api/v1/mongo/discounts
router.get("/", async (req, res, next) => {
  try {
    const uid = req.user.id; // Get current user ID

    // Fetch user-specific discounts OR global discounts
    const items = await UserDiscount.find({
      $or: [
        { user_id: uid },
        { isGlobal: true, user_id: null } // Global coupons
      ]
    }).sort({ createdAt: -1 }).lean();

    const now = new Date();
    const withStatus = items.map((d) => {
      const expired = d.endDate && now > new Date(d.endDate);
      const notStarted = d.startDate && now < new Date(d.startDate);
      const usageExceeded = typeof d.usageLimit === "number" && typeof d.usedCount === "number" && d.usedCount >= d.usageLimit;
      const isValid = !expired && !notStarted && !usageExceeded;
      let invalidReason = "";
      if (expired) invalidReason = "expired";
      else if (notStarted) invalidReason = "not_started";
      else if (usageExceeded) invalidReason = "usage_limit_reached";
      return { ...d, isValid, invalidReason };
    });
    res.json({ success: true, count: items.length, items: withStatus });
  } catch (err) { next(err); }
});

// POST /api/v1/mongo/discounts
router.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const required = ["code", "type", "value", "startDate", "endDate"];
    for (const k of required) {
      if (body[k] === undefined || body[k] === null || body[k] === "") {
        return res.status(400).json({ error: true, message: `${k} required` });
      }
    }
    const rawCode = String(body.code || "");
    const normCode = rawCode.trim().toUpperCase();
    if (!normCode) return res.status(400).json({ error: true, message: "code required" });
    if (!["percentage", "fixed"].includes(body.type)) {
      return res.status(400).json({ error: true, message: "type must be 'percentage' or 'fixed'" });
    }
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    if (!(start instanceof Date) || isNaN(start.getTime()) || !(end instanceof Date) || isNaN(end.getTime())) {
      return res.status(400).json({ error: true, message: "startDate/endDate invalid" });
    }
    if (end < start) return res.status(400).json({ error: true, message: "endDate must be after startDate" });

    try {
      const isGlobal = !!body.isGlobal; // Ensure boolean
      let userIdToAssign = null;

      if (!isGlobal) {
        if (body.targetUserEmail) {
          const targetUser = await User.findOne({ email: body.targetUserEmail });
          if (!targetUser) {
            return res.status(400).json({ error: true, message: "Target user not found with provided email." });
          }
          userIdToAssign = targetUser._id;
        } else {
          // If not global and no targetUserEmail, assign to the current admin user
          userIdToAssign = req.user.id;
        }
      }
      // If isGlobal is true, userIdToAssign remains null, which is what we want for global coupons

      const created = await UserDiscount.create({
        user_id: userIdToAssign, // Use the determined user_id
        code: normCode,
        description: body.description || "",
        type: body.type,
        value: Number(body.value),
        maxDiscount: body.maxDiscount != null ? Number(body.maxDiscount) : undefined,
        minOrderAmount: body.minOrderAmount != null ? Number(body.minOrderAmount) : undefined,
        startDate: start,
        endDate: end,
        isGlobal: isGlobal, // Add the isGlobal field
      });
      return res.status(201).json({ success: true, item: created });
    } catch (e) {
      if (e?.code === 11000) {
        return res.status(409).json({ error: true, message: "Discount code already exists" });
      }
      throw e;
    }
  } catch (err) { next(err); }
});

// DELETE /api/v1/mongo/discounts/:id
router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const deletedCoupon = await UserDiscount.findByIdAndDelete(id);

    if (!deletedCoupon) {
      return res.status(404).json({ error: true, message: "Coupon not found" });
    }

    res.json({ success: true, message: "Coupon deleted successfully", item: deletedCoupon });
  } catch (err) {
    next(err);
  }
});

export default router;