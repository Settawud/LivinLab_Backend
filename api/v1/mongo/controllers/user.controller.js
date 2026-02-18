import { User } from "../../../../models/User.js";
// Location models (used for population and listing endpoints)
import { Province } from "../../../../models/Province.js";
import { District } from "../../../../models/District.js";
import { Subdistrict } from "../../../../models/Subdistrict.js";
import { Cart } from "../../../../models/Cart.js";
import jwt from "jsonwebtoken";
import { sendVerificationEmail, sendPasswordResetEmail } from "../../../../utils/sendEmails.js";

import crypto from "crypto";
import mongoose from "mongoose";

//POST /api/v1/mongo/auth/register

export const register = async (req, res, next) => {
    try {
        const { firstName, lastName, email, phone, password, image } = req.body || {};
        const exists = await User.findOne({ email });
        if (exists) return res.status(409).json({ error: true, message: "Email already used "});

        // Admin signup via secret (optional, controlled by env)
        const requestedRole = String(req.body?.role || "user").toLowerCase();
        let finalRole = "user";
        if (requestedRole === "admin") {
            const provided = String(req.body?.adminSecret || "");
            const configured = process.env.ADMIN_SIGNUP_SECRET || "";
            if (!configured) {
                return res.status(403).json({ error: true, code: "ADMIN_SIGNUP_DISABLED", message: "Admin signup is disabled" });
            }
            if (provided !== configured) {
                return res.status(403).json({ error: true, code: "ADMIN_SIGNUP_SECRET_INVALID", message: "Invalid admin signup secret" });
            }
            finalRole = "admin";
        }

      const user = await User.create({ firstName, lastName, email, phone, password, image, role: finalRole });
      await Cart.create({ userId: user._id, items: [] });

      // Send verification email
      try {
        const raw = makeToken(16);
        user.emailVerifyTokenHash = sha256(raw);
        user.emailVerifyTokenExpires = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24h
        await user.save();
        await sendVerificationEmail(user.email, raw);
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        // Decide if you want to fail the registration or just log the error
      }

        return res.status(201).json({ error: false, user }); //password ถูกตัดออกด้วย toJSON แล้ว
    } catch (err) {
        next(err);
    }
};

// Helper function to issue JWTs and set cookies
const issueTokensAndRespond = (res, user) => {
  const safeUser = user.toObject();
  delete safeUser.password;

  const accessToken = jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      role: user.role || "user",
      sv: user.sessionsVersion,
    },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  const refreshToken = jwt.sign(
    { userId: user._id.toString(), sv: user.sessionsVersion },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "dev_secret",
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d" }
  );

  try {
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  } catch (e) {
    console.error("Cookie setting failed in issueTokensAndRespond:", e);
  }

  return res.json({ error: false, token: accessToken, refreshToken, user: safeUser });
};

// POST /api/v1/mongo/auth/login
export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};
    // ต้อง .select('+password') เพราะใน schema ตั้ง select:false  (401 Unauthenticated ยังไม่ได้ login หรือ login ไม่ผ่าน)
        const user = await User.findOne({ email }).select("+password");
        if (!user) return res.status(401).json({ error: true, message: "Invalid credentials" });

        if (!user.emailVerified) {
            return res.status(401).json({ error: true, message: "Email not verified. Please verify your email to log in." });
        }

        const ok =  await user.comparePassword(password);
        if (!ok) return res.status(401).json({ error: true, message: "Invalid credentials" });

        return issueTokensAndRespond(res, user);
    } catch (err) {
        next(err);
    }
};

// POST /api/v1/mongo/auth/verify-email/confirm { email, token }
export const verifyEmailConfirm = async (req, res, next) => {
  try {
    console.log("verifyEmailConfirm received:", req.body);
    const email = String(req.body?.email || "").toLowerCase();
    const raw = String(req.body?.token || "");
    console.log("Extracted email:", email, "Extracted token:", raw);
    const user = await User.findOne({ email });
    if (!user || !user.emailVerifyTokenHash || !user.emailVerifyTokenExpires) {
      return res.status(400).json({ error: true, message: "Invalid verification request" });
    }
    if (user.emailVerifyTokenExpires < new Date()) {
      return res.status(400).json({ error: true, message: "Verification token expired" });
    }
    if (user.emailVerifyTokenHash !== sha256(raw)) {
      return res.status(400).json({ error: true, message: "Invalid verification token" });
    }
    user.emailVerified = true;
    user.emailVerifyTokenHash = null;
    user.emailVerifyTokenExpires = null;
    await user.save();
    
    // Log the user in by issuing tokens
    return issueTokensAndRespond(res, user);
  } catch (err) { next(err); }
};

// GET /api/v1/mongo/users/me
export const me = async (req, res, next) => {
    try {
        // ใช้ req.user.id ที่เติมโดย jwtBearer
        const user = await User.findById(req.user?.id);
        if (!user) return res.status(404).json({ error: true, message: "Not found" });
        return res.json({ error: false, user });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/mongo/users/me (แก้ไขโปรไฟล์ทั่วไป)
export const updateMe = async (req, res, next) => {
    try {
        const { firstName, lastName, phone, image, addresses } = req.body || {};
        const user = await User.findByIdAndUpdate(
            req.user?.id,
            { $set: { firstName, lastName, phone, image, addresses } },
            { new: true, runValidators: true }
            );
        return res.json({ error: false, user });
    } catch (err) {
        next(err);
    }
};

// PATCH /api/v1/mongo/users/me/password (เปลี่ยนรหัสผ่าน)
export const changePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user?.id).select("+password");
        if (!user) return res.status(404).json({ error: true, message: "Not found"});
        const ok = await user.comparePassword(oldPassword);
        if (!ok) return res.status(400).json({ error: true, message: "Old password incorrect" });

        // ใช้ instance + save → pre("save") จะ hash ให้อัตโนมัติ
        user.password = newPassword;
        // bump sessionsVersion เพื่อให้ token เก่าหมดอายุ
        user.sessionsVersion += 1;
        await user.save();

        return res.json({ error: false, message: "Password updated" });
    } catch (err) {
        next(err);
    }

};

// POST /api/v1/mongo/auth/logout (clear cookie; client should discard token)
export const logout = async (req, res, _next) => {
  try {
    if (typeof res.clearCookie === "function") {
      res.clearCookie("accessToken", { httpOnly: true, sameSite: "lax", secure: false });
      res.clearCookie("refreshToken", { httpOnly: true, sameSite: "lax", secure: false });
    }
  } catch {}
  return res.json({ error: false, message: "Logged out" });
};

// POST /api/v1/mongo/auth/logout-all (revoke all tokens via sessionsVersion)
export const logoutAll = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: true, message: "Unauthorized" });
    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ error: true, message: "Not found" });
    user.sessionsVersion += 1;
    await user.save();
    try {
      res.clearCookie?.("accessToken", { httpOnly: true, sameSite: "lax", secure: false });
      res.clearCookie?.("refreshToken", { httpOnly: true, sameSite: "lax", secure: false });
    } catch {}
    return res.json({ error: false, message: "Logged out all sessions" });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/mongo/auth/refresh
export const refresh = async (req, res, next) => {
  try {
    const token =
      req.cookies?.refreshToken ||
      req.body?.refreshToken ||
      req.headers["x-refresh-token"]; // fallback for non-cookie clients
    if (!token) return res.status(401).json({ error: true, message: "Missing refresh token" });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "dev_secret");
    } catch (e) {
      const isExpired = e?.name === "TokenExpiredError";
      return res.status(401).json({ error: true, code: isExpired ? "REFRESH_EXPIRED" : "REFRESH_INVALID", message: isExpired ? "Refresh token expired" : "Invalid refresh token" });
    }

    const user = await User.findById(payload.userId).select("email firstName lastName role sessionsVersion");
    if (!user) return res.status(401).json({ error: true, message: "Unauthorized" });
    if (typeof payload.sv === "number" && user.sessionsVersion !== payload.sv) {
      return res.status(401).json({ error: true, code: "SESSION_REVOKED", message: "Session revoked" });
    }

    const newAccess = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        role: user.role || "user",
        sv: user.sessionsVersion,
      },
      process.env.JWT_SECRET || "dev_secret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
    try {
      res.cookie?.("accessToken", newAccess, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    } catch {}
    return res.json({ error: false, token: newAccess });
  } catch (err) { next(err); }
};

// === Forgot / Reset password ===
function makeToken(len = 32) {
  return crypto.randomBytes(len).toString("hex");
}
function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

const makeResetToken = (user) => {
  const secret = `${process.env.JWT_SECRET}-${user.password}-${user.sessionsVersion}`;
  return jwt.sign({ userId: user._id }, secret, { expiresIn: "1h" });
};

const verifyResetToken = (token, user) => {
  const secret = `${process.env.JWT_SECRET}-${user.password}-${user.sessionsVersion}`;
  try {
    const payload = jwt.verify(token, secret);
    return payload.userId === user._id.toString();
  } catch (e) {
    return false;
  }
};

// POST /api/v1/mongo/auth/password/forgot { email }
export const passwordForgot = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").toLowerCase();
    const user = await User.findOne({ email }).select("email password sessionsVersion");

    // To avoid user enumeration, always respond with success, but only send email if user exists.
    if (user) {
      const token = makeResetToken(user);
      try {
        await sendPasswordResetEmail(user.email, token);
      } catch (emailError) {
        console.error("Failed to send password reset email:", emailError);
        // Optional: Decide if you want to throw an error to the client if email fails.
        // In this case, we still return a generic success message.
      }
    }

    return res.json({ error: false, message: "If that email exists, a reset link has been sent." });
  } catch (err) { next(err); }
};

// POST /api/v1/mongo/auth/password/reset { token, newPassword }
export const passwordReset = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ error: true, message: "Token and new password are required" });
    }

    let decoded;
    try {
      // First, decode the token to get theuserId without verifying it yet.
      decoded = jwt.decode(token);
      if (!decoded?.userId) throw new Error("Invalid token structure");
    } catch {
      return res.status(400).json({ error: true, message: "Invalid or malformed token" });
    }

    const user = await User.findById(decoded.userId).select("+password sessionsVersion");
    if (!user) {
      return res.status(400).json({ error: true, message: "Invalid token: user not found" });
    }

    // Now, verify the token with the secret that depends on the user\'s current password.
    const isValid = verifyResetToken(token, user);
    if (!isValid) {
      return res.status(400).json({ error: true, message: "Invalid or expired reset token" });
    }

    // Set new password. The pre-save hook will hash it.
    user.password = newPassword;
    // Invalidate all existing sessions and this reset token by bumping the version.
    user.sessionsVersion += 1;
    await user.save();

    // Log the user in by issuing tokens
    return issueTokensAndRespond(res, user);
  } catch (err) { next(err); }
};


// === Email verification ===
// POST /api/v1/mongo/auth/verify-email/request { email }
export const verifyEmailRequest = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").toLowerCase();
    const user = await User.findOne({ email });
    if (!user) return res.json({ error: false, message: "If that email exists, a verification email was sent." });
    if (user.emailVerified) {
      return res.json({ error: false, message: "Email already verified" });
    }
    const raw = makeToken(16);
    user.emailVerifyTokenHash = sha256(raw);
    user.emailVerifyTokenExpires = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24h
    await user.save();

    // --- SEND REAL EMAIL ---
    try {
      await sendVerificationEmail(user.email, raw);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      user.emailVerifyTokenHash = null;
      user.emailVerifyTokenExpires = null;
      await user.save();
    }
    return res.json({ error: false, message: "Verification email sent", token: process.env.NODE_ENV === "production" ? undefined : raw });
  } catch (err) { next(err); }
};


// === Address CRUD (for current user) ===
// GET /api/v1/mongo/users/me/addresses
export const listAddresses = async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.id)
      .select("addresses")
      .populate("addresses.province", "name_th name_en province_id")
      .populate("addresses.district", "name_th name_en district_id province_id")
      .populate("addresses.subdistrict", "name_th name_en subdistrict_id district_id postcode")
      .lean();
    if (!user) return res.status(404).json({ error: true, message: "Not found" });

    const items = (user.addresses || []).map((a) => ({
      ...a,
      provinceName: a?.province?.name_th || a?.province?.name_en || null,
      districtName: a?.district?.name_th || a?.district?.name_en || null,
      subdistrictName: a?.subdistrict?.name_th || a?.subdistrict?.name_en || null,
      postcode: a?.subdistrict?.postcode || a?.postcode || null,
    }));
    return res.json({ error: false, items });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/mongo/users/me/addresses/:addressId
export const getAddressById = async (req, res, next) => {
  try {
    const { addressId } = req.params;
    const user = await User.findOne(
      { _id: req.user?.id, "addresses.addressId": addressId },
      { "addresses.$": 1 }
    )
      .populate("addresses.province", "name_th name_en province_id")
      .populate("addresses.district", "name_th name_en district_id province_id")
      .populate("addresses.subdistrict", "name_th name_en subdistrict_id district_id postcode")
      .lean();
    if (!user || !user.addresses || user.addresses.length === 0) {
      return res.status(404).json({ error: true, message: "Address not found" });
    }
    const a = user.addresses[0];
    const address = {
      ...a,
      provinceName: a?.province?.name_th || a?.province?.name_en || null,
      districtName: a?.district?.name_th || a?.district?.name_en || null,
      subdistrictName: a?.subdistrict?.name_th || a?.subdistrict?.name_en || null,
      postcode: a?.subdistrict?.postcode || a?.postcode || null,
    };
    return res.status(200).json({ address });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/mongo/users/me/addresses
export const createAddress = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: true, message: "Unauthorized" });

    const addressId = new mongoose.Types.ObjectId();
    const { buildingNo, detail, postcode, subdistrict, district, province, isDefault } = req.body || {};

    // Decide defaulting behavior: if request sets isDefault OR user currently has no default, new address becomes default
    const before = await User.findById(uid).select("addresses").lean();
    const hadAny = Array.isArray(before?.addresses) && before.addresses.length > 0;
    const hadDefault = hadAny && before.addresses.some((a) => a.isDefault);
    const makeDefault = !!isDefault || !hadDefault;

    if (makeDefault) {
      await User.updateOne({ _id: uid }, { $set: { "addresses.$[].isDefault": false } });
    }

    const updated = await User.findByIdAndUpdate(
      uid,
      {
        $push: {
          addresses: {
            addressId,
            buildingNo,
            detail,
            postcode,
            subdistrict,
            district,
            province,
            isDefault: makeDefault,
          },
        },
      },
      { new: true, runValidators: true, select: "addresses" }
    ).lean();

    const created = (updated?.addresses || []).find((a) => String(a.addressId) === String(addressId));
    return res.status(201).json({ error: false, address: created });
  } catch (err) { next(err); }
};

// PATCH /api/v1/mongo/users/me/addresses/:addressId
export const updateAddress = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const { addressId } = req.params;
    if (!uid) return res.status(401).json({ error: true, message: "Unauthorized" });

    const allow = ["buildingNo", "detail", "postcode", "subdistrict", "district", "province", "isDefault"];
    const patch = {};
    for (const k of allow) if (k in (req.body || {})) patch[k] = req.body[k];

    if (patch.isDefault === true) {
      await User.updateOne({ _id: uid }, { $set: { "addresses.$[].isDefault": false } });
    }

    const setOps = {};
    for (const [k, v] of Object.entries(patch)) setOps[`addresses.$.${k}`] = v;

    // Avoid positional projection with returnNewDocument (Mongo restriction)
    const resUpdate = await User.updateOne(
      { _id: uid, "addresses.addressId": addressId },
      { $set: setOps },
      { runValidators: true }
    );

    if (!resUpdate.matchedCount) {
      return res.status(404).json({ error: true, message: "Address not found" });
    }

    const after = await User.findById(uid).select("addresses").lean();
    const addr = (after?.addresses || []).find((a) => String(a.addressId) === String(addressId));
    if (!addr) return res.status(404).json({ error: true, message: "Address not found" });
    return res.json({ error: false, address: addr });
  } catch (err) { next(err); }
};

// DELETE /api/v1/mongo/users/me/addresses/:addressId
export const deleteAddress = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const { addressId } = req.params;
    if (!uid) return res.status(401).json({ error: true, message: "Unauthorized" });

    const before = await User.findById(uid).select("addresses").lean();
    if (!before) return res.status(404).json({ error: true, message: "Not found" });
    const target = (before.addresses || []).find((a) => String(a.addressId) === String(addressId));
    if (!target) return res.status(404).json({ error: true, message: "Address not found" });

    const wasDefault = !!target.isDefault;
    await User.updateOne({ _id: uid }, { $pull: { addresses: { addressId } } });

    // Fetch remaining addresses
    const after = await User.findById(uid).select("addresses").lean();
    const remaining = after?.addresses || [];

    if (remaining.length === 0) {
      return res.json({ error: false, deleted: { addressId }, message: "No addresses left. Please add an address." });
    }

    // If deleted one was default, promote the first remaining as default
    if (wasDefault) {
      const first = remaining[0];
      if (first && first.addressId) {
        await User.updateOne(
          { _id: uid, "addresses.addressId": first.addressId },
          { $set: { "addresses.$.isDefault": true } }
        );
        return res.json({ error: false, deleted: { addressId }, newDefaultAddressId: String(first.addressId) });
      }
    }

    return res.json({ error: false, deleted: { addressId } });
  } catch (err) { next(err); }
};

// Namespace and aliases for routes

export const selectAddress = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    const addressId = req.params?.addressId || req.body?.addressId;
    if (!uid) return res.status(401).json({ error: true, message: "Unauthorized" });
    if (!addressId) return res.status(400).json({ error: true, message: "Missing addressId" });

    await User.updateOne({ _id: uid }, { $set: { "addresses.$[].isDefault": false } });
    const resUpdate = await User.updateOne(
      { _id: uid, "addresses.addressId": addressId },
      { $set: { "addresses.$.isDefault": true } }
    );
    if (!resUpdate.matchedCount) {
      return res.status(404).json({ error: true, message: "Address not found" });
    }
    const after = await User.findById(uid).select("addresses").lean();
    const addr = (after?.addresses || []).find((a) => String(a.addressId) === String(addressId));
    if (!addr) return res.status(404).json({ error: true, message: "Address not found" });
    return res.json({ error: false, address: addr });
  } catch (err) { next(err); }
};

export const listSubdistrictsByDistrict = async (req, res, _next) => {
  try {
    const raw = String(req.params?.districtId || "");
    let key;
    if (mongoose.isValidObjectId(raw)) {
      const d = await District.findById(raw).lean();
      if (!d) return res.status(404).json({ error: true, message: "District not found" });
      key = d.district_id;
    } else if (/^\d+$/.test(raw)) {
      key = parseInt(raw, 10);
    } else {
      return res.status(400).json({ error: true, message: "Invalid district identifier" });
    }
    const items = await Subdistrict.find({ district_id: key }).select("name_th name_en subdistrict_id postcode").lean();
    return res.json({ error: false, count: items.length, items });
  } catch (err) { _next(err); }
};

export const getSubdistrict = async (req, res, _next) => {
  try {
    const raw = String(req.params?.subdistrictId || "");
    let doc = null;
    if (mongoose.isValidObjectId(raw)) {
      doc = await Subdistrict.findById(raw).lean();
    } else if (/^\d+$/.test(raw)) {
      doc = await Subdistrict.findOne({ subdistrict_id: parseInt(raw, 10) }).lean();
    } else {
      return res.status(400).json({ error: true, message: "Invalid subdistrict identifier" });
    }
    if (!doc) return res.status(404).json({ error: true, message: "Subdistrict not found" });
    return res.json({ error: false, item: doc });
  } catch (err) { _next(err); }
};

// List all provinces
export const listProvinces = async (_req, res, next) => {
  try {
    const items = await Province.find().select("name_th name_en province_id").lean();
    return res.json({ error: false, count: items.length, items });
  } catch (err) { next(err); }
};

export const listDistrictsByProvince = async (req, res, next) => {
  try {
    const raw = String(req.params?.provinceId || "");
    let key;
    if (mongoose.isValidObjectId(raw)) {
      const p = await Province.findById(raw).lean();
      if (!p) return res.status(404).json({ error: true, message: "Province not found" });
      key = p.province_id;
    } else if (/^\d+$/.test(raw)) {
      key = parseInt(raw, 10);
    } else {
      return res.status(400).json({ error: true, message: "Invalid province identifier" });
    }
    const items = await District.find({ province_id: key }).select("name_th name_en district_id province_id").lean();
    return res.json({ error: false, count: items.length, items });
  } catch (err) { next(err); }
};

// (removed stub listProvinces)
