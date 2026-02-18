import express from "express";
import jwtBearer from "../../../middleware/jwtBearer.js";
import { User } from "../../../models/User.js";
import multer from "multer";
import CloudinaryStorage from 'multer-storage-cloudinary';
import cloudinary from "../../../config/cloudinary.js";
import { 
  me, 
  updateMe, 
  changePassword, 
  listAddresses, 
  getAddressById, 
  createAddress, 
  updateAddress, 
  deleteAddress, 
  listDistrictsByProvince, 
  listSubdistrictsByDistrict, 
  getSubdistrict,
  listProvinces,
} from "./controllers/user.controller.js";


const router = express.Router();
router.use(jwtBearer);

function requireCloudinaryConfigured(_req, res, next) {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env || {};
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return res.status(503).json({
      error: true,
      message:
        "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET and restart the server.",
    });
  }
  next();
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "users",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  }),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mimeOk = /image\/(jpe?g|png|webp)/i.test(file.mimetype || "");
    const extOk = /\.(jpe?g|png|webp)$/i.test(file.originalname || "");
    const ok = mimeOk || extOk;
    if (!ok) return cb(new Error("Invalid file type"), false);
    cb(null, true);
  },
});

// PATCH /api/v1/mongo/users/me/image
router.patch(
  "/me/image",
  requireCloudinaryConfigured,
  upload.single("image"),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user?.id);
      if (!user) return res.status(404).json({ error: true, message: "User not found" });

      // ถ้ามีไฟล์ใหม่ → อัปโหลดรูปใหม่ + ลบรูปเก่าออก
      if (req.file) {
        // ลบรูปเก่าออกก่อน (ถ้ามี)
        if (user.image) {
          try {
            const oldPublicId = user.image?.publicId
              || (typeof user.image === "string" && user.image.split("/").pop().split(".")[0] ? `users/${user.image.split("/").pop().split(".")[0]}` : null);
            if (oldPublicId) await cloudinary.uploader.destroy(oldPublicId, { resource_type: "image" });
          } catch (e) {
            console.warn("Failed to delete old image:", e.message);
          }
        }

        // อัปเดตรูปใหม่ เก็บเป็น { url, publicId } ให้ตรงสคีมา
        const url = req.file.path || req.file.secure_url || "";
        const publicId = req.file.filename || req.file.public_id || null;
        // fallback เดาจาก URL หากไม่มีข้อมูล publicId (จะได้รูปแบบ users/<name>)
        const fallbackId = url ? `users/${url.split("/").pop().split(".")[0]}` : null;
        user.image = { url, publicId: publicId || fallbackId };
        await user.save();
        return res.json({ success: true, user });
      }

      // ถ้าไม่มีไฟล์ → แปลว่าต้องการลบรูป
      if (user.image) {
        try {
          const oldPublicId = user.image?.publicId
            || (typeof user.image === "string" && user.image.split("/").pop().split(".")[0] ? `users/${user.image.split("/").pop().split(".")[0]}` : null);
          if (oldPublicId) await cloudinary.uploader.destroy(oldPublicId, { resource_type: "image" });
        } catch (e) {
          console.warn("Failed to delete old image:", e.message);
        }
      }
      user.image = null;
      await user.save();
      return res.json({ success: true, user });
    } catch (err) {
      if (err?.message === "Invalid file type") {
        return res
          .status(400)
          .json({ error: true, message: "Only JPG/PNG/WebP images are allowed" });
      }
      next(err);
    }
  }
);

// Current user profile routes
router.get("/me", me);
router.patch("/me", updateMe);
router.patch("/me/password", changePassword);

// User address routes (mounted at /api/v1/mongo/users)
router.get("/me/addresses", listAddresses);
router.get("/me/addresses/:addressId", getAddressById);
router.post("/me/addresses", createAddress);
router.patch("/me/addresses/:addressId", updateAddress);
router.delete("/me/addresses/:addressId", deleteAddress);

// Locations (ปรับ path ไม่ให้ชนกัน และใช้รูปแบบ flat)
router.get("/me/address/provinces", listProvinces);
router.get("/me/address/province/:provinceId/districts", listDistrictsByProvince);
router.get("/me/address/district/:districtId/subdistricts", listSubdistrictsByDistrict);
router.get("/me/address/subdistrict/:subdistrictId", getSubdistrict);








export default router;
