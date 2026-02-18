import { Product } from "../../../../models/Product.js";
import { reviews as Review } from "../../../../models/Reviews.js";
import cloudinary from "../../../../config/cloudinary.js";
import mongoose from "mongoose";

// Helpers
const normalizeImages = (arr) => (Array.isArray(arr) ? arr : []);
const toImageObject = (it) => (typeof it === "string" ? { url: it, publicId: it } : { url: it?.url, publicId: it?.publicId });
const uniqByPublicId = (arr) => Array.from(new Map(arr.map((it) => [it.publicId, { url: it.url, publicId: it.publicId }])).values());
const pickOneUploaded = (fileOrFiles) => {
  const f = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles;
  if (!f) return null;
  const url = f?.path || f?.secure_url || "";
  const publicId = f?.filename || f?.public_id || "";
  if (!url || !publicId) return null;
  return { url, publicId };
};

// Products
export async function listProducts(req, res, next) {
  try {
    const {
      search = "",
      category,
      minPrice,
      maxPrice,
      sort,
      availability,
      page = 1,
    } = req.query;

    const match = {};

    if (category) {
      const raw = String(category || "").trim().toLowerCase();
      const base = raw.split("(")[0].trim();
      const isIn = (arr) => arr.includes(base);
      const groups = {
        chairs: ["chairs", "chair", "ergonomic chair", "ergonomic chairs", "เก้าอี้", "เก้าอี้เพื่อสุขภาพ"],
        tables: ["tables", "table", "desk", "desks", "standing desk", "standing desks", "โต๊ะ", "โต๊ะยืน"],
        accessories: ["accessories", "accessory", "อุปกรณ์", "อุปกรณ์เสริม"],
      };
      let groupKey = null;
      if (isIn(groups.chairs)) groupKey = "chairs";
      else if (isIn(groups.tables)) groupKey = "tables";
      else if (isIn(groups.accessories)) groupKey = "accessories";

      if (groupKey) {
        const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        match.$or = groups[groupKey].map((label) => ({
          category: new RegExp(`^${esc(label)}$`, "i"),
        }));
      } else {
        const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        match.category = new RegExp(`^${esc(base)}$`, "i");
      }
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      match.$or = [
        { name: { $regex: regex } },
        { description: { $regex: regex } },
        { tags: { $in: [regex] } },
      ];
    }

    if (availability === "instock") {
      match.$expr = {
        $gt: [
          {
            $size: {
              $filter: {
                input: "$variants",
                as: "v",
                cond: { $gt: ["$$v.quantityInStock", 0] }
              }
            }
          },
          0
        ]
      };
    }

    const limit = 9;
    const skip = (parseInt(page) - 1) * limit;

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          minPrice: {
            $min: {
              $map: {
                input: {
                  $filter: {
                    input: "$variants",
                    as: "v",
                    cond: { $eq: ["$$v.trial", false] }
                  }
                },
                as: "v",
                in: "$$v.price"
              }
            }
          }
        }
      }
    ];

    const priceCond = {};
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    if (!isNaN(min)) priceCond.$gte = min;
    if (!isNaN(max)) priceCond.$lte = max;
    if (Object.keys(priceCond).length) {
      pipeline.push({
        $match: {
          minPrice: priceCond,
        }
      });
    }

    const sortStage = {};
    if (sort) {
      const [field, dir] = sort.split(":");
      if (field === "variants.price") sortStage["minPrice"] = dir === "desc" ? -1 : 1;
      else if (field === "createdAt") sortStage["createdAt"] = dir === "desc" ? -1 : 1;
    }
    pipeline.push({ $sort: Object.keys(sortStage).length ? sortStage : { createdAt: -1 } });

    const facet = {
      items: [{ $skip: skip }, { $limit: limit }],
      total: [{ $count: "count" }]
    };
    pipeline.push({ $facet: facet });

    const result = await Product.aggregate(pipeline);
    const { items, total } = result[0];

    res.json({
      success: true,
      count: items.length,
      total: total[0]?.count || 0,
      page: parseInt(page),
      items
    });
  } catch (err) {
    next(err);
  }
}

export async function getProduct(req, res, next) {
  try {
    const item = await Product.findById(req.params.productId).lean();
    if (!item) return res.status(404).json({ error: true, message: "Not found" });
    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
}

export async function createProduct(req, res, next) {
  try {
    const created = await Product.create(req.body || {});
    res.status(201).json({ success: true, item: created });
  } catch (err) {
    next(err);
  }
}

// export async function updateProduct(req, res, next) {
//   try {
//     const updated = await Product.findByIdAndUpdate(
//       req.params.productId,
//       { $set: req.body || {} },
//       { new: true, runValidators: true }
//     );
//     if (!updated) return res.status(404).json({ error: true, message: "Not found" });
//     res.json({ success: true, item: updated });
//   } catch (err) {
//     next(err);
//   }
// }


export async function updateProduct(req, res, next) {
    try {
        const { variants, ...productUpdates } = req.body;
        const productId = req.params.productId;

        // 1. Fetch the product to compare variants
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: true, message: "Product not found" });
        }

        // 2. Handle variants updates and deletions
        if (variants && Array.isArray(variants)) {
            const reqVariantIds = variants.filter(v => v._id).map(v => v._id.toString());
            const databaseVariantIds = product.variants.map(v => v._id.toString());
            
            // Variants to delete are those in the database but not in the frontend payload
            const variantsToDelete = databaseVariantIds.filter(id => !reqVariantIds.includes(id));

            // Create a bulk operation to handle updates, additions, and deletions
            const bulkOps = [];

            // Deletion step: remove variants that are no longer in the payload
            if (variantsToDelete.length > 0) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: productId },
                        update: { 
                            $pull: { 
                                variants: { 
                                    _id: { 
                                        $in: variantsToDelete.map(id => new mongoose.Types.ObjectId(id)) 
                                    } 
                                } 
                            } 
                        }
                    }
                });
            }

            // Update and addition steps (same as before)
            const variantsToUpdate = variants.filter(v => v._id);
            const variantsToAdd = variants.filter(v => !v._id);

            // 1. Bulk update existing variants
            variantsToUpdate.forEach(variant => {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: productId, "variants._id": variant._id },
                        update: {
                            $set: {
                                "variants.$.colorId": variant.colorId,
                                "variants.$.price": variant.price,
                                "variants.$.quantityInStock": variant.quantityInStock,
                                "variants.$.trial": variant.trial,
                                "variants.$.image": variant.image,
                            }
                        }
                    }
                });
            });

            // 2. Add new variants
            if (variantsToAdd.length > 0) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: productId },
                        update: { $push: { variants: { $each: variantsToAdd } } }
                    }
                });
            }

            // Execute all bulk operations
            if (bulkOps.length > 0) {
                await Product.bulkWrite(bulkOps);
            }
        }

        // 3. Update top-level product fields (all except `variants`)
        await Product.findByIdAndUpdate(productId, { $set: productUpdates });
        
        // Finally, fetch the completely updated document to send back to the client
        const finalProduct = await Product.findById(productId);

        if (!finalProduct) {
            return res.status(404).json({ error: true, message: "Product not found" });
        }

        res.json({ success: true, item: finalProduct });
    } catch (err) {
        next(err);
    }
}

export async function deleteProduct(req, res, next) {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.productId);
    if (!deleted) return res.status(404).json({ error: true, message: "Not found" });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// Upload images (product or variant)
export async function uploadProductImages(req, res, next) {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });

    const uploaded = pickOneUploaded(req.file || (Array.isArray(req.files) ? req.files[0] : null));

    if (!uploaded) {
      return res.status(400).json({ error: true, message: "No images uploaded" });
    }

    // Explicitly disallow using this endpoint for variant upload
    if (req.body && req.body.variantId) {
      return res.status(400).json({ error: true, message: "Use /products/:productId/variants/:variantId/images for variant uploads" });
    }

    const existing = normalizeImages(product.thumbnails).map(toImageObject).filter((x) => x.url && x.publicId);
    product.thumbnails = uniqByPublicId([...existing, uploaded]);

    await product.save();
    return res.status(201).json({
      success: true,
      images: [uploaded],
      product,
    });
  } catch (err) {
    if (err?.message === "Invalid file type") {
      return res.status(400).json({ error: true, message: "Only JPG/PNG/WebP images are allowed" });
    }
    next(err);
  }
}

// Variants
export async function listVariants(req, res, next) {
  try {
    const product = await Product.findById(req.params.productId).lean();
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });
    res.json({ success: true, count: (product.variants || []).length, items: product.variants || [] });
  } catch (err) { next(err); }
}

export async function getVariant(req, res, next) {
  try {
    const product = await Product.findById(req.params.productId).lean();
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });
    const variant = (product.variants || []).find((v) => String(v._id) === String(req.params.variantId));
    if (!variant) return res.status(404).json({ error: true, message: "Variant not found" });
    res.json({ success: true, item: variant });
  } catch (err) { next(err); }
}

export async function createVariant(req, res, next) {
  try {
    const { colorId, price, quantityInStock, trial = false, image = null } = req.body || {};
    if (!colorId || !Number.isFinite(Number(price)) || !Number.isFinite(Number(quantityInStock))) {
      return res.status(400).json({ error: true, message: "colorId, price, quantityInStock required" });
    }
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });
    const img = image ? toImageObject(image) : null;
    const one = img && img.url && img.publicId ? img : undefined;
    product.variants.push({ colorId, price: Number(price), quantityInStock: Number(quantityInStock), trial: !!trial, ...(one ? { image: one } : {}) });
    await product.save();
    const created = product.variants[product.variants.length - 1];
    res.status(201).json({ success: true, item: created, productId: product._id });
  } catch (err) { next(err); }
}

export async function updateVariant(req, res, next) {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });
    const variant = product.variants.id(req.params.variantId);
    if (!variant) return res.status(404).json({ error: true, message: "Variant not found" });
    const payload = req.body || {};
    if (payload.colorId !== undefined) variant.colorId = payload.colorId;
    if (payload.price !== undefined) variant.price = Number(payload.price);
    if (payload.quantityInStock !== undefined) variant.quantityInStock = Number(payload.quantityInStock);
    if (payload.trial !== undefined) variant.trial = !!payload.trial;
    if (payload.image !== undefined) {
      if (payload.image === null) {
        variant.image = undefined;
      } else {
        const obj = toImageObject(payload.image);
        variant.image = obj && obj.url && obj.publicId ? obj : undefined;
      }
    }
    await product.save();
    res.json({ success: true, item: variant });
  } catch (err) { next(err); }
}

export async function deleteVariant(req, res, next) {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });
    const variant = product.variants.id(req.params.variantId);
    if (!variant) return res.status(404).json({ error: true, message: "Variant not found" });
    variant.deleteOne();
    await product.save();
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function uploadVariantImages(req, res, next) {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });
    const variant = product.variants.id(req.params.variantId);
    if (!variant) return res.status(404).json({ error: true, message: "Variant not found" });

    const uploaded = pickOneUploaded(req.file || (Array.isArray(req.files) ? req.files[0] : null));
    if (!uploaded) {
      return res.status(400).json({ error: true, message: "No images uploaded" });
    }

    // POST should not overwrite: conflict if image already exists
    if (variant.image && variant.image.url && variant.image.publicId) {
      return res.status(409).json({ error: true, message: "Variant already has an image. Use PUT to replace it." });
    }
    variant.image = uploaded;
    await product.save();
    return res.status(201).json({
      success: true,
      images: [uploaded],
      productId: product._id,
      variantId: variant._id,
    });
  } catch (err) {
    if (err?.message === "Invalid file type") {
      return res.status(400).json({ error: true, message: "Only JPG/PNG/WebP images are allowed" });
    }
    next(err);
  }
}

// PUT replace variant image (always set to uploaded image)
export async function replaceVariantImage(req, res, next) {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });
    const variant = product.variants.id(req.params.variantId);
    if (!variant) return res.status(404).json({ error: true, message: "Variant not found" });

    const uploaded = pickOneUploaded(req.file || (Array.isArray(req.files) ? req.files[0] : null));
    if (!uploaded) {
      return res.status(400).json({ error: true, message: "No images uploaded" });
    }

    variant.image = uploaded;
    await product.save();
    return res.status(200).json({
      success: true,
      images: [uploaded],
      productId: product._id,
      variantId: variant._id,
    });
  } catch (err) {
    if (err?.message === "Invalid file type") {
      return res.status(400).json({ error: true, message: "Only JPG/PNG/WebP images are allowed" });
    }
    next(err);
  }
}

// Delete a single product-level image by publicId
export async function deleteProductImage(req, res, next) {
  try {
    const { productId } = req.params;
    const rawParam = req.params?.publicId;
    const fromQuery = req.query?.publicId;
    const publicId = (Array.isArray(rawParam) ? rawParam.join("/") : rawParam) || String(fromQuery || "");
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });

    const existing = normalizeImages(product.thumbnails).map(toImageObject);
    const before = existing.length;
    const keep = existing.filter((img) => img.publicId !== publicId);
    if (keep.length === before) {
      return res.status(404).json({ error: true, message: "Image not found" });
    }

    // Try to delete from Cloudinary; ignore errors to allow metadata cleanup
    try { await cloudinary.uploader.destroy(publicId, { resource_type: "image" }); } catch {}

    product.thumbnails = keep;
    await product.save();
    return res.json({ success: true });
  } catch (err) { next(err); }
}

// Delete a single variant image by publicId
export async function deleteVariantImage(req, res, next) {
  try {
    const { productId, variantId } = req.params;
    const rawParam = req.params?.publicId;
    const fromQuery = req.query?.publicId;
    const publicId = (Array.isArray(rawParam) ? rawParam.join("/") : rawParam) || String(fromQuery || "");
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: true, message: "Product not found" });
    const variant = product.variants.id(variantId);
    if (!variant) return res.status(404).json({ error: true, message: "Variant not found" });

    const existing = variant.image && variant.image.publicId ? [variant.image] : [];
    if (!existing.length || existing[0].publicId !== publicId) {
      return res.status(404).json({ error: true, message: "Image not found" });
    }

    try { await cloudinary.uploader.destroy(publicId, { resource_type: "image" }); } catch {}

    variant.image = undefined;
    await product.save();
    return res.json({ success: true });
  } catch (err) { next(err); }
}

// Popular products by average review rating
export async function popularProducts(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 4, 48));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const minAvg = isNaN(parseFloat(req.query.minAvg)) ? 3 : parseFloat(req.query.minAvg);
    // Aggregate average ratings per product
    const aggAll = await Review.aggregate([
      { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      { $match: { avg: { $gte: minAvg } } },
      { $sort: { avg: -1, count: -1 } },
    ]);

    const total = aggAll.length;
    const win = aggAll.slice(offset, offset + limit);
    const ids = win.map((a) => a._id);
    if (!ids.length) {
      return res.json({ success: true, total, count: 0, items: [] });
    }
    const products = await Product.find({ _id: { $in: ids } }).lean();
    const mapProd = new Map(products.map((p) => [String(p._id), p]));

    const items = [];
    for (const a of win) {
      const p = mapProd.get(String(a._id));
      if (!p) continue;
      // compute primary image (thumbnail first, then variant image)
      const t0 = Array.isArray(p.thumbnails) ? p.thumbnails[0] : null;
      const thumbUrl = typeof t0 === "string" ? t0 : t0?.url || null;
      let variantUrl = null;
      if (Array.isArray(p.variants)) {
        const v = p.variants.find((vv) => vv?.image && (typeof vv.image === "string" ? vv.image : vv.image?.url));
        if (v) variantUrl = typeof v.image === "string" ? v.image : v.image?.url;
      }
      const image = thumbUrl || variantUrl || null;
      items.push({
        _id: p._id,
        name: p.name,
        image,
        category: p.category,
        avgRating: a.avg || 0,
        reviewCount: a.count || 0,
        minPrice: Array.isArray(p.variants) && p.variants.length ? Math.min(...p.variants.map((v) => Number(v.price || 0))) : 0,
        trial: !!(p.trial || (Array.isArray(p.variants) && p.variants.some((v) => !!v.trial))),
      });
    }

    res.set("Cache-Control", "public, max-age=60, s-maxage=120");
    return res.json({ success: true, total, count: items.length, items, offset, limit, minAvg });
  } catch (err) { next(err); }
}


const toImageObject2 = (it) => {
    if (it && typeof it === 'object' && (it.path || it.secure_url) && (it.filename || it.public_id)) {
        return { 
            url: it.path || it.secure_url, 
            publicId: it.filename || it.public_id 
        };
    }
    return (typeof it === "string" ? { url: it, publicId: it } : { url: it?.url, publicId: it?.publicId });
};


export async function uploadMultipleProductImages(req, res, next) {
  
    try {
      const { productId } = req.params;
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ error: true, message: "Product not found" });
      }

      // 1. Get the list of public IDs from the frontend
      const currentPublicIds = req.body.currentPublicIds || [];
      
      // 2. Identify new images to upload
      const uploadedFiles = normalizeImages(req.files).map(toImageObject2);
      
      // 3. Identify images to delete
      const existingImages = normalizeImages(product.thumbnails).map(toImageObject2);
      const toDelete = existingImages.filter(
        (img) => !currentPublicIds.includes(img.publicId)
      );

      // 4. Perform deletions on Cloudinary
      for (const img of toDelete) {
        try {
          await cloudinary.uploader.destroy(img.publicId, { resource_type: "image" });
        } catch (err) {
          // Log the error but continue to update the database
          console.error("Cloudinary deletion failed:", err);
        }
      }

      // 5. Update the product's thumbnails
      const updatedThumbnails = [
        ...existingImages.filter(img => currentPublicIds.includes(img.publicId)),
        ...uploadedFiles
      ];
      product.thumbnails = updatedThumbnails;
      
      await product.save();
      
      return res.status(200).json({
        success: true,
        message: "Thumbnails updated successfully",
        thumbnails: product.thumbnails,
      });
    } catch (err) {
      if (err?.message === "Invalid file type") {
        return res.status(400).json({ error: true, message: "Only JPG/PNG/WebP images are allowed" });
      }
      next(err);
    }
  }

