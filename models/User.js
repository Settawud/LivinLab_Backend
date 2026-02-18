import mongoose, { Schema, model } from "mongoose";
import bcrypt from "bcrypt";
import { imageSchema } from "./Product.js";
const { ObjectId } = mongoose.Schema.Types;

// ---------------------------- Address Schema ---------------------------- //
// โครงสร้างข้อมูล "ที่อยู่" ของผู้ใช้
// _id: false = ไม่ต้องสร้าง id แยกให้กับทุก address
const AddressSchema = new Schema(
  {
    addressId: { type: ObjectId, required: true }, // id อ้างอิงของ address
    buildingNo: { type: String, trim: true },      // บ้านเลขที่/อาคาร
    detail: { type: String, trim: true },          // รายละเอียดที่อยู่
    postcode: {
      type: String,
      trim: true,
      validate: {
        // Thai postal code: 5 digits
        validator: (v) => !v || /^\d{5}$/.test(v),
        message: "Invalid Thai postal code (5 digits)",
      },
    },
    subdistrict: { type: ObjectId, ref: "Subdistrict", required: true },
    district: { type: ObjectId, ref: "District", required: true },
    province: { type: ObjectId, ref: "Province", required: true },
    isDefault: { type: Boolean, default: false },  // true = ใช้เป็นที่อยู่หลัก
  }, 
  { _id: false }
);

// ---------------------------- User Schema ---------------------------- //
// โครงสร้างข้อมูล "ผู้ใช้"
const UserSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true }, // ชื่อจริง
    lastName: { type: String, required: true, trim: true },  // นามสกุล

    // อีเมล: ห้ามซ้ำ, ต้องตรงรูปแบบอีเมล, แปลงเป็นตัวเล็กอัตโนมัติ
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || ""),
        message: "Invalid email format",
      },
    },

    // เบอร์โทร: ไม่บังคับ แต่ถ้ามี ต้องตรงรูปแบบเบอร์ เช็คด้วย regex
    phone: {
      type: String,
      trim: true,
      validate: {
        // Thai phone number: must start with 0 and be 10 digits
        validator: (v) => !v || /^0\d{9}$/.test(v),
        message: "Invalid Thai phone number (format: 0XXXXXXXXX)",
      },
    },

    // รหัสผ่าน: ต้องยาว ≥ 6 ตัวอักษร
    // select:false = เวลา query ปกติจะไม่ส่ง password กลับมา
    password: { type: String, required: true, minlength: 6, select: false },

    // Single image per user: { url, publicId }
    image: {type: imageSchema, default: null},
     // รูปโปรไฟล์
    emailVerified: { type: Boolean, default: false },
    emailVerifyTokenHash: { type: String, default: null },
    emailVerifyTokenExpires: { type: Date, default: null },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    sessionsVersion: { type: Number, default: 0 },    // ใช้บังคับให้ logout ทุก session ได้
    addresses: { type: [AddressSchema], default: [] }, // ที่อยู่หลายรายการ
  },
  {
    timestamps: true, // สร้าง createdAt และ updatedAt ให้อัตโนมัติ

    // เวลาส่งออกเป็น JSON → ตัดข้อมูลสำคัญบางตัวออก
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.password;       // ไม่ส่ง password ออก
        delete ret.resetTokenHash; // ไม่ส่ง reset token ออก
        delete ret.emailVerifyTokenHash;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ---------------------------- Middleware ---------------------------- //
// ก่อนบันทึก (save): ถ้ารหัสผ่านถูกแก้ → เข้ารหัส (hash) ก่อนเก็บ
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// ก่อนอัปเดตด้วย findOneAndUpdate: ถ้ามี password ใหม่ → เข้ารหัสก่อนเก็บ
UserSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate() || {};
  const $set = update.$set || {};

  // ดึงรหัสผ่านใหม่ (ถ้ามี)
  let newPassword = Object.prototype.hasOwnProperty.call(update, "password")
    ? update.password
    : Object.prototype.hasOwnProperty.call($set, "password")
    ? $set.password
    : undefined;

  // ถ้ามี password ใหม่ → hash ทันที แล้วแทนค่าใน query
  if (newPassword) {
    const hash = await bcrypt.hash(String(newPassword), 10);
    const nextSet = { ...$set, password: hash };
    const nextUpdate = { ...update, $set: nextSet };

    // ลบ password plaintext ออก ป้องกันการเผลอเก็บตรง ๆ
    delete nextUpdate.password;
    this.setUpdate(nextUpdate);
  }
  next();
});

// ---------------------------- Methods ---------------------------- //
// ตรวจสอบรหัสผ่าน (ตอน login)
// รับรหัสผ่านที่ผู้ใช้กรอก มาเทียบกับ hash ที่เก็บไว้
UserSchema.methods.comparePassword = function (plain) {
  if (!this.password) return false;
  return bcrypt.compare(String(plain || ""), this.password);
};

// ฟังก์ชันช่วยเปลี่ยนรหัสผ่าน → จะ hash ให้เสร็จในตัว
UserSchema.methods.setPassword = async function (plain) {
  this.password = await bcrypt.hash(String(plain), 10);
};

// ---------------------------- Model ---------------------------- //
export const User = model("User", UserSchema);
