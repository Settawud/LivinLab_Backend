// config/cloudinary.js
// Ensure environment variables are loaded before configuring Cloudinary.
// This avoids a race where modules import this file before dotenv runs in index.js.
import dotenv from "dotenv";
dotenv.config();

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
