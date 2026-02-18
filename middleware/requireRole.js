import { User } from "../models/User.js";

export default function requireRole(role) {
  return async function (req, res, next) {
    try {
      const uid = req.user?.id;
      if (!uid) return res.status(401).json({ error: true, message: "Unauthorized" });
      // First trust role from JWT if present
      if (req.user?.role) {
        if (req.user.role !== role) return res.status(403).json({ error: true, message: "Forbidden" });
        return next();
      }
      // Fallback to DB lookup if role not in token
      const user = await User.findById(uid).select("role");
      if (!user) return res.status(401).json({ error: true, message: "Unauthorized" });
      if (user.role !== role) return res.status(403).json({ error: true, message: "Forbidden" });
      return next();
    } catch (err) {
      next(err);
    }
  };
}
