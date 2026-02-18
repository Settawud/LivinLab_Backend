import jwt from "jsonwebtoken";

export default async function jwtBearer(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieToken = req.cookies?.accessToken;
  const useToken = token || cookieToken;
  if (!useToken) {
    console.log(req.headers)
    console.log(req.cookies)
    return res.status(401).json({ error: true, message: "Unauthorized", headers: req.headers, cookies: req.cookies });
    
  }
  try {
    const decoded = jwt.verify(useToken, process.env.JWT_SECRET || "dev_secret");
    req.user = { id: decoded.userId, email: decoded.email, name: decoded.name, role: decoded.role };

    // Optional sessionVersion check (Mongo-backed tokens only)
    if (typeof decoded.sv === "number" && process.env.MONGO_URI) {
      try {
        const { User } = await import("../models/User.js");
        const user = await User.findById(decoded.userId).select("sessionsVersion");
        if (!user || user.sessionsVersion !== decoded.sv) {
          return res.status(401).json({ error: true, code: "SESSION_REVOKED", message: "Session revoked" });
        }
      } catch (e) {
        return res.status(503).json({ error: true, code: "AUTH_BACKEND_UNAVAILABLE", message: "Auth backend unavailable" });
      }
    }
    next();
  } catch (err) {
    const isExpired = err?.name === "TokenExpiredError";
    return res.status(401).json({
      error: true,
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      message: isExpired ? "Token expired" : "Invalid token",
    });
  }
}
