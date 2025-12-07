// Minimal JWT auth middleware with DEFAULT export
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const auth = (req, res, next) => {
  try {
    // Accept Bearer, x-auth-token, or cookie named "token"
    const h = req.headers.authorization || req.headers.Authorization;
    let token = null;

    if (h && h.startsWith("Bearer ")) token = h.slice(7).trim();
    if (!token && req.headers["x-auth-token"]) token = req.headers["x-auth-token"];
    if (!token && req.cookies?.token) token = req.cookies.token;

    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach exactly what your controllers expect
    req.user = { id: decoded.id || decoded._id, role: decoded.role || "seller" };
    req.sellerId = req.user.id; // convenience for seller-only handlers

    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default auth;
