import express from "express";
import jwtBearer from "../../../middleware/jwtBearer.js";
import requireRole from "../../../middleware/requireRole.js";
import multer from "multer";
import CloudinaryStorage from 'multer-storage-cloudinary';
import cloudinary from "../../../config/cloudinary.js";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
  deleteProductImage,
  listVariants,
  getVariant,
  createVariant,
  updateVariant,
  deleteVariant,
  uploadVariantImages,
  replaceVariantImage,
  deleteVariantImage,
  popularProducts,
  uploadMultipleProductImages,
} from "./controllers/product.controller.js";

const router = express.Router();
            
// GET /api/v1/mongo/products?q=...&category=...
router.get("/", listProducts);

// GET /api/v1/mongo/products/popular
router.get("/popular", popularProducts);

// GET /api/v1/mongo/products/:productId
router.get("/:productId", getProduct);

// POST /api/v1/mongo/products (auth required)
router.post("/", jwtBearer, requireRole("admin"), createProduct);

// PATCH /api/v1/mongo/products/:productId
router.patch("/:productId", jwtBearer, requireRole("admin"), updateProduct);

// DELETE /api/v1/mongo/products/:productId
router.delete("/:productId", jwtBearer, requireRole("admin"), deleteProduct);

// === Upload product images (admin only) ===
function requireCloudinaryConfigured(req, res, next) {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env || {};
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return res.status(503).json({
      error: true,
      message: "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET and restart the server.",
    });
  }
  next();
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "products",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  }),
});
// ก่อนประกาศ upload = multer(...)
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const mimeOk = /image\/(jpe?g|png|webp)/i.test(file.mimetype || "");
    const extOk  = /\.(jpe?g|png|webp)$/i.test(file.originalname || "");
    const ok = mimeOk || extOk;
    if (!ok) {
      console.warn('Reject upload:', { mimetype: file.mimetype, name: file.originalname });
      return cb(new Error("Invalid file type"), false);
    }
    cb(null, true);
  },
});

// const upload = multer({
//   storage,
//   limits: { fileSize: 5 * 1024 * 1024, files: 10 },
//   fileFilter: (_req, file, cb) => {
//     const ok = /image\/(jpe?g|png|webp)/.test(file.mimetype || "");
//     cb(ok ? null : new Error("Invalid file type"), ok);
//   },
// });

// POST /api/v1/mongo/products/:productId/images
router.post(
  "/:productId/images",
  jwtBearer,
  requireRole("admin"),
  requireCloudinaryConfigured,
  upload.single("image"),
  uploadProductImages
);

// DELETE product-level image by publicId
// Support deleting by publicId containing slashes (e.g., "products/abc123")
router.delete(
  "/:productId/images/:publicId",
  jwtBearer,
  requireRole("admin"),
  deleteProductImage
);
// Alternative: delete by query param to avoid URL-encoding slashes in publicId
router.delete(
  "/:productId/images",
  jwtBearer,
  requireRole("admin"),
  deleteProductImage
);

// === Variants nested routes ===
// GET /api/v1/mongo/products/:productId/variants
router.get("/:productId/variants", listVariants);

// GET /api/v1/mongo/products/:productId/variants/:variantId
router.get("/:productId/variants/:variantId", getVariant);

// POST /api/v1/mongo/products/:productId/variants (admin)
router.post("/:productId/variants", jwtBearer, requireRole("admin"), createVariant);

// PATCH /api/v1/mongo/products/:productId/variants/:variantId (admin)
router.patch("/:productId/variants/:variantId", jwtBearer, requireRole("admin"), updateVariant);

// DELETE /api/v1/mongo/products/:productId/variants/:variantId (admin)
router.delete("/:productId/variants/:variantId", jwtBearer, requireRole("admin"), deleteVariant);

// POST /api/v1/mongo/products/:productId/variants/:variantId/images (admin)
// Upload a new variant image (will 409 if already exists)
router.post(
  "/:productId/variants/:variantId/images",
  jwtBearer,
  requireRole("admin"),
  requireCloudinaryConfigured,
  upload.single("image"),
  uploadVariantImages
);

// PUT /api/v1/mongo/products/:productId/variants/:variantId/images (admin)
// Replace existing variant image with the uploaded one
router.put(
  "/:productId/variants/:variantId/images",
  jwtBearer,
  requireRole("admin"),
  requireCloudinaryConfigured,
  upload.single("image"),
  replaceVariantImage
);

// DELETE variant image by publicId
router.delete(
  "/:productId/variants/:variantId/images/:publicId",
  jwtBearer,
  requireRole("admin"),
  deleteVariantImage
);

// Alternative: delete variant image by query param to avoid URL-encoding slashes
router.delete(
  "/:productId/variants/:variantId/images",
  jwtBearer,
  requireRole("admin"),
  deleteVariantImage
);

// PATCH /api/v1/mongo/products/:productId/images
router.patch(
  "/:productId/images",
  jwtBearer,
  requireRole("admin"),
  requireCloudinaryConfigured,
  upload.array("images", 10), // This endpoint can accept multiple new files
  uploadMultipleProductImages
);

export default router;
