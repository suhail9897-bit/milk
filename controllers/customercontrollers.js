// controllers/customercontrollers.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Customer from "../models/customer.js";
import Notification from "../models/notification.js";
import mongoose from "mongoose";
import Seller from "../models/seller.js";


const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });


/** Helper: read sellerId from req.user OR Bearer token */
function getSellerIdFromReq(req) {
  // if your auth middleware sets req.user / req.seller use it:
  const id =
    req?.user?.id ||
    req?.user?._id ||
    req?.seller?.id ||
    req?.auth?.id ||
    null;

  if (id) return { id, role: "seller" };

  // Fallback: decode JWT from Authorization header
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.split(" ")[1] : null;
  if (!token) return {};

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { id: decoded.id, role: decoded.role };
  } catch {
    return {};
  }
}

// ✅ default export at the start
export default {
  /** POST /api/customer/register  (Seller creates a customer) */
  async registerBySeller(req, res) {
    try {
      const { name, phone, address, password } = req.body;

      if (!name || !phone || !password) {
        return res
          .status(400)
          .json({ message: "name, phone, password are required" });
      }

      const { id: sellerId, role } = getSellerIdFromReq(req);
      if (!sellerId) return res.status(401).json({ message: "Unauthorized" });
      if (role && role !== "seller")
        return res.status(403).json({ message: "Only sellers can add customers" });

      // unique phone guard (global)
      const exists = await Customer.findOne({ phone }).lean();
      if (exists) {
        return res.status(409).json({ message: "Phone already registered" });
      }

      const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);
      const hashed = await bcrypt.hash(password, rounds);

      const customer = await Customer.create({
        name,
        phone,
        address,
        password: hashed,
        passwordPlain: password, 
        seller: sellerId,
      });

      return res.status(201).json({
        customer: {
          id: customer._id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address || null,
          seller: customer.seller,
          passwordPlain: password, 
        },
        message: "Customer created",
      });
    } catch (err) {
      console.error("registerBySeller error:", err);
      return res.status(500).json({ message: "Failed to create customer" });
    }
  },
};

//customer login controller
export const loginCustomer = async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password) {
      return res
        .status(400)
        .json({ message: "phone and password are required" });
    }

    const customer = await Customer.findOne({ phone }).select("+password");
    if (!customer) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (customer.isActive === false) {
      return res.status(403).json({ message: "Account disabled" });
    }

    const ok = await bcrypt.compare(password, customer.password);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({
      id: customer._id,
      role: "customer",
      seller: customer.seller,
    });

    return res.json({
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address || null,
        seller: customer.seller,
      },
    });
  } catch (err) {
    console.error("loginCustomer error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
};


//get customer profile controller

/**
 * GET /api/customer/me
 * Reads JWT from Authorization: Bearer <token>
 * Returns the full customer document (including milkEntries).
 */
// controllers/customercontrollers.js
export const getCustomerMe = async (req, res) => {
  try {
    // 1) Read header
    const hdr =
      req.headers.authorization ||
      req.headers["x-access-token"] ||
      "";
    let raw = hdr.split(",").map(s => s.trim()).pop() || "";
    raw = raw.replace(/^Bearer\s+/i, "").replace(/^"+|"+$/g, "").trim();
    if (!raw) return res.status(401).json({ message: "Missing Authorization token" });

    // 2) Verify
    const decoded = jwt.verify(raw, process.env.JWT_SECRET);
    const id = decoded?.id || decoded?._id;
    if (!id) return res.status(401).json({ message: "Invalid token payload" });

    // 3) Fetch customer
    const customer = await Customer.findById(id)
      .select("+passwordPlain")   // (tumhare existing code jaisa hi)
      .lean();
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    // 4) Fetch ONLY basic seller fields (name, phone) — optional
    let sellerBasic = null;
    if (customer.seller) {
      const sid = new mongoose.Types.ObjectId(String(customer.seller));
      const s = await Seller.findById(sid).select("name phone").lean();
      if (s) sellerBasic = { _id: s._id, name: s.name, phone: s.phone };
    }

    // 5) Return — customer unchanged (seller still ObjectId), plus sellerBasic
    return res.json({ customer, sellerBasic });
  } catch (err) {
    console.error("getCustomerMe error:", err);
    return res.status(401).json({ message: "Invalid/expired token", error: err?.message });
  }
};


// GET /api/customer/notifications?limit=10
export const getCustomerNotifications = async (req, res) => {
  try {
    // token parsing same as /me
    const hdr =
      req.headers.authorization ||
      req.headers["x-access-token"] ||
      "";
    let raw = hdr.split(",").map(s => s.trim()).pop() || "";
    raw = raw.replace(/^Bearer\s+/i, "").replace(/^"+|"+$/g, "").trim();
    if (!raw) return res.status(401).json({ message: "Missing Authorization token" });

    const decoded = jwt.verify(raw, process.env.JWT_SECRET);
    const customerId = decoded?.id || decoded?._id;
    if (!customerId) return res.status(401).json({ message: "Invalid token payload" });

    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10) || 10, 1), 50);

    const rows = await Notification.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("seller", "name")
      .lean();

    // return raw rows; UI me message string banao
    return res.json({ notifications: rows });
  } catch (err) {
    console.error("getCustomerNotifications error:", err);
    return res.status(500).json({ message: "Failed to fetch notifications" });
  }
};