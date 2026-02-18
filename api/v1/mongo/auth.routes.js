import express from "express";
import jwtBearer from "../../../middleware/jwtBearer.js";
import {
  register,
  login,
  logout,
  logoutAll,
  refresh,
  passwordForgot,
  passwordReset,
  verifyEmailRequest,
  verifyEmailConfirm,
} from "./controllers/user.controller.js";

const router = express.Router();

// POST /api/v1/mongo/auth/register
router.post("/register", register);

// POST /api/v1/mongo/auth/login
router.post("/login", login);

// POST /api/v1/mongo/auth/logout
router.post("/logout", jwtBearer, logout);

// POST /api/v1/mongo/auth/logout-all
router.post("/logout-all", jwtBearer, logoutAll);

// Refresh access token
router.post("/refresh", refresh);

// Forgot/reset password
router.post("/password/forgot", passwordForgot);
router.post("/password/reset", passwordReset);

// Email verification
router.post("/verify-email/request", verifyEmailRequest);
router.post("/verify-email/confirm", verifyEmailConfirm);

export default router;
