// E:\useful app\backend\controllers\sellercontrollers.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Seller from "../models/seller.js";
import Customer from "../models/customer.js";
import mongoose from "mongoose";
import Notification from "../models/notification.js";
import PDFDocument from "pdfkit";

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

/** REGISTER */
export const registerSeller = async (req, res) => {
  try {
    const { name, phone, email, password, address } = req.body;

    if (!name || !phone || !password) {
      return res
        .status(400)
        .json({ message: "name, phone and password are required" });
    }

    const exists = await Seller.findOne({
      $or: [{ phone }, ...(email ? [{ email }] : [])],
    }).lean();

    if (exists) {
      return res.status(409).json({
        message:
          exists.phone === phone
            ? "Phone already registered"
            : "Email already registered",
      });
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);
    const hashed = await bcrypt.hash(password, saltRounds);

    const seller = await Seller.create({
      name,
      phone,
      email,
      password: hashed,
      passwordPlain: password,
      address,
    });

    const token = signToken({ id: seller._id, role: "seller" });

    return res.status(201).json({
      token,
      seller: {
        id: seller._id,
        name: seller.name,
        phone: seller.phone,
        email: seller.email || null,
        address: seller.address || null,
        passwordPlain: password,
      },
    });
  } catch (err) {
    console.error("registerSeller error:", err);
    return res.status(500).json({ message: "Registration failed" });
  }
};

// DELETE a customer that belongs to the logged-in seller
// DELETE /api/seller/customer/:id
export const deleteCustomer = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?._id;
    if (!sellerId) return res.status(401).json({ message: "Unauthorized" });

    const customerId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    // Sirf ussi customer ko delete karne do jo iss seller ka ho
    const deleted = await Customer.findOneAndDelete({ _id: customerId, seller: sellerId });

    if (!deleted) {
      return res.status(404).json({ message: "Customer not found for this seller" });
    }

    return res.json({ message: "Customer deleted", customerId: deleted._id });
  } catch (err) {
    console.error("deleteCustomer error:", err);
    return res.status(500).json({ message: "Server error while deleting customer" });
  }
};


/** LOGIN (email OR phone OR identifier supported) */
export const loginSeller = async (req, res) => {
  try {
    const { phone, email, identifier, password } = req.body;
    if (!password) {
      return res.status(400).json({ message: "password is required" });
    }

    let query = null;
    if (phone) query = { phone };
    else if (email) query = { email };
    else if (identifier)
      query = /@/.test(identifier) ? { email: identifier } : { phone: identifier };

    if (!query) {
      return res
        .status(400)
        .json({ message: "Provide phone or email along with password" });
    }

    const seller = await Seller.findOne(query).select("+password +passwordPlain");
    if (!seller) return res.status(401).json({ message: "Invalid credentials" });

    if (seller.isActive === false) {
      return res.status(403).json({ message: "Account disabled" });
    }

    const ok = await bcrypt.compare(password, seller.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken({ id: seller._id, role: "seller" });

    return res.json({
      token,
      seller: {
        id: seller._id,
        name: seller.name,
        phone: seller.phone,
        email: seller.email || null,
        address: seller.address || null,
        passwordPlain: seller.passwordPlain || null,
      },
    });
  } catch (err) {
    console.error("loginSeller error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
};

/** GET MY CUSTOMERS (only customers belonging to the logged-in seller) */
export const getMyCustomers = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?._id;
    if (!sellerId) return res.status(401).json({ message: "Unauthorized" });

    const customers = await Customer.find({ seller: sellerId })
      .select("+passwordPlain")           // ⬅️ add this line
      .sort({ createdAt: -1 });

    return res.json({ customers });
  } catch (err) {
    console.error("getMyCustomers error:", err);
    return res.status(500).json({ message: "Server error fetching customers" });
  }
};
// --- toggle / set customer active status ---
// PATCH /api/seller/customers/:id/active
// Body: { isActive: true/false }
export const setCustomerActiveStatus = async (req, res) => {
  try {
    const customerId = req.params.id;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be boolean (true/false)" });
    }

    // auth middleware ne seller ko req.user me set kiya hota hai
    const sellerId = req.user?.id || req.user?._id;

    // Sirf ussi customer ko update karo jo is seller ka hai
    const updated = await (await import("../models/customer.js")).default.findOneAndUpdate(
      { _id: customerId, seller: sellerId },
      { isActive },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Customer not found for this seller" });
    }

    return res.json({
      message: `Customer marked as ${isActive ? "Active" : "Not Active"}`,
      customer: updated,
    });
  } catch (err) {
    console.error("setCustomerActiveStatus error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

//enteries save controller
export const upsertMilkEntry = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?._id;
    if (!sellerId) return res.status(401).json({ message: "Unauthorized" });

    const customerId = req.params.id;
    const { date, quantity, pricePerLitre, fat, type = "cow", sent = true } = req.body || {};
    if (!date) return res.status(400).json({ message: "date is required (YYYY-MM-DD)" });

    const q = Number(quantity), p = Number(pricePerLitre), f = Number(fat);
    if (!(q > 0)) return res.status(400).json({ message: "quantity must be > 0" });
    if (!(p > 0)) return res.status(400).json({ message: "pricePerLitre must be > 0" });
    if (!(f >= 0)) return res.status(400).json({ message: "fat must be >= 0" });

    const d = new Date(date);
    if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid date" });
    const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

    const customer = await Customer.findOne({ _id: customerId, seller: sellerId });
    if (!customer) return res.status(404).json({ message: "Customer not found for this seller" });

    if (customer.createdAt) {
      const reg = new Date(customer.createdAt);
      const regUTC = new Date(Date.UTC(reg.getUTCFullYear(), reg.getUTCMonth(), reg.getUTCDate()));
      if (nd < regUTC) return res.status(400).json({ message: "Date is before customer's registration date" });
    }

    const total = Number((q * p).toFixed(2));
    const sameDay = (a, b) =>
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate();

    if (!Array.isArray(customer.milkEntries)) customer.milkEntries = [];

    const idx = customer.milkEntries.findIndex(e => e?.date && sameDay(new Date(e.date), nd));
    const fields = { date: nd, quantity: q, pricePerLitre: p, total, fat: f, type, sent: !!sent };

 const payload = { _id: new mongoose.Types.ObjectId(), ...fields };

// (1) same date ki purani entry (leave ho ya normal) nikaal do
await Customer.collection.updateOne(
  { _id: customer._id, seller: new mongoose.Types.ObjectId(String(sellerId)) },
  { $pull: { milkEntries: { date: nd } } }
);

// (2) fresh valid entry push karo
await Customer.collection.updateOne(
  { _id: customer._id, seller: new mongoose.Types.ObjectId(String(sellerId)) },
  { $push: { milkEntries: payload } }
);

// (3) send notification (non-blocking)
// (3) send notification (non-blocking)
try {
  const KEEP_NOTIFS = 30;

  await Notification.create({
    customer: customer._id,
    seller: sellerId,
    type: "send",
    entryId: payload._id,
    date: payload.date,
    quantity: payload.quantity,
    pricePerLitre: payload.pricePerLitre,
    fat: payload.fat,
    milkType: payload.type,
  });

  // ✅ cleanup: per-customer sirf latest 30 rakho, baaki delete
  const oldRows = await Notification.find({ customer: customer._id })
    .sort({ createdAt: -1 })        // latest first (createdAt comes from timestamps) :contentReference[oaicite:1]{index=1}
    .skip(KEEP_NOTIFS)
    .select("_id")
    .lean();

  if (oldRows.length) {
    await Notification.deleteMany({ _id: { $in: oldRows.map(r => r._id) } });
  }
} catch (e) {
  console.error("notify(send) error:", e);
}


return res.status(200).json({
  message: "Milk entry saved",
  entry: payload,
  customerId: customer._id,
});
  } catch (err) {
    console.error("upsertMilkEntry error:", err);
    return res.status(500).json({ message: "Server error while saving milk entry" });
  }
};


//milk entry delete
// DELETE one milk entry (by entryId if provided; otherwise by date)
// DELETE one milk entry (by entryId if provided; otherwise by date)
 // DELETE one milk entry (by entryId if provided; otherwise by date)
 export const deleteMilkEntry = async (req, res) => {
   try {
     const sellerId = req.user?.id || req.user?._id;
     if (!sellerId) return res.status(401).json({ message: "Unauthorized" });

     const customerId = req.params.id;
     const { entryId } = req.params;
     const dateStr = req.query.date || req.body?.date; // fallback

     // Ensure this customer belongs to seller
     const owner = await Customer.findOne({ _id: customerId, seller: sellerId }).select("_id");
     if (!owner) return res.status(404).json({ message: "Customer not found for this seller" });

    const sid = new mongoose.Types.ObjectId(String(sellerId));
    const filt = { _id: owner._id, seller: sid };

     if (entryId) {
       let oid;
       try {
         oid = new mongoose.Types.ObjectId(entryId);
       } catch {
         return res.status(400).json({ message: "Invalid entryId" });
       }

       const r = await Customer.collection.updateOne(filt, { $pull: { milkEntries: { _id: oid } } });
       if (!r.modifiedCount) return res.status(404).json({ message: "Milk entry not found" });
       return res.json({ message: "Milk entry deleted", customerId, entryId });
     }

     if (dateStr) {
       const d = new Date(dateStr);
       if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid date" });
       const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

       const r = await Customer.collection.updateOne(filt, { $pull: { milkEntries: { date: nd } } });
       if (!r.modifiedCount) return res.status(404).json({ message: "Milk entry not found for that date" });
       return res.json({ message: "Milk entry deleted", customerId, date: dateStr });
     }

     return res.status(400).json({ message: "Provide entryId or date" });
   } catch (err) {
     console.error("deleteMilkEntry error:", err);
     return res.status(500).json({ message: "Server error while deleting milk entry" });
   }
 };


// LEAVE: create a blank milk entry for a given date
// POST /api/seller/customer/:id/milk/leave
export const markLeave = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?._id;
    if (!sellerId) return res.status(401).json({ message: "Unauthorized" });

    const customerId = req.params.id;
    const { date } = req.body || {};
    if (!date) return res.status(400).json({ message: "date is required (YYYY-MM-DD)" });

    // normalize date to midnight UTC
    const d = new Date(date);
    if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid date" });
    const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

    // make sure this customer belongs to the logged-in seller
    const customer = await Customer.findOne({ _id: customerId, seller: sellerId }).lean();
    if (!customer) return res.status(404).json({ message: "Customer not found for this seller" });

    // Prepare a BLANK leave doc (all fields as empty string)
    const leaveDoc = {
      _id: new mongoose.Types.ObjectId(),
      date: nd,
      quantity: "",
      pricePerLitre: "",
      total: "",
      fat: "",
      type: "",
      sent: ""
    };

    // ⚠️ We bypass mongoose validators intentionally so that empty strings can be stored.
    // 1) Remove any existing entry for that date
    await Customer.collection.updateOne(
      { _id: customer._id, seller: customer.seller },
      { $pull: { milkEntries: { date: nd } } }
    );

    // 2) Push a fresh blank entry
    await Customer.collection.updateOne(
      { _id: customer._id, seller: customer.seller },
      { $push: { milkEntries: leaveDoc } }
    );

 
    // 🔔 create "leave" notification (non-blocking)
    try {
      await Notification.create({
        customer: customer._id,
        seller: sellerId,
        type: "leave",
        entryId: leaveDoc._id,
        date: leaveDoc.date,
        milkType: "",   // blank by design
      });
    } catch (e) {
      console.error("notify(leave) error:", e);
    }

    return res.status(201).json({ message: "Leave marked", entry: leaveDoc, customerId: customer._id });
  } catch (err) {
    console.error("markLeave error:", err);
    return res.status(500).json({ message: "Server error while marking leave" });
  }
};


//bill generate controller
export const generateMonthlyBill = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?._id || req.sellerId;
    if (!sellerId) return res.status(401).json({ message: "Unauthorized" });

    const customerId = req.params.id;
    const monthStr = (req.query.month || "").trim(); // "YYYY-MM"
    // validate month
    const m = /^(\d{4})-(\d{2})$/.exec(monthStr);
    if (!m) return res.status(400).json({ message: "month must be YYYY-MM" });
    const year = +m[1], mon = +m[2]; // 1-12

    // month UTC range
    const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
    const end   = new Date(Date.UTC(year, mon, 1, 0, 0, 0)); // exclusive

    // verify ownership + fetch minimal seller for header
    const [customer, seller] = await Promise.all([
      Customer.findOne({ _id: customerId, seller: sellerId }).lean(),
      Seller.findById(sellerId).lean()
    ]);
    if (!customer) return res.status(404).json({ message: "Customer not found for this seller" });

    // pick entries of the selected month
    const entries = (customer.milkEntries || [])
      .filter(e => e?.date && new Date(e.date) >= start && new Date(e.date) < end)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // compute totals
    const num = v => (v === "" || v === null || typeof v === "undefined") ? null : Number(v);
    let totalAmount = 0, totalLitres = 0;
    entries.forEach(e => {
      const q = num(e.quantity), p = num(e.pricePerLitre), t = num(e.total);
      if (q && q > 0) totalLitres += q;
      if (t && t > 0) totalAmount += t;
    });

    // ---------- PDF ----------
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bill-${(customer.name || "customer").replace(/\s+/g, "_")}-${monthStr}.pdf"`
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    // Header
    doc.fontSize(16).text("Milk Service — Monthly Bill", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Month     : ${start.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`);
    doc.text(`Seller    : ${seller?.name || "—"}  (${seller?.phone || "—"})`);
    doc.text(`Customer  : ${customer.name || "—"}  (${customer.phone || "—"})`);
    doc.moveDown(0.8);

    // Table header
    const X = 40;
    const cols = [X, 110, 180, 240, 290, 350, 420]; // Date | Qty | Price | Fat | Type | Total | Note
    const line = (ys, arr) => arr.forEach((s, i) => doc.text(String(s), cols[i], ys, { width: (cols[i + 1] || 540) - cols[i] }));
    doc.fontSize(11).fillColor("#000");
    line(doc.y, ["Date", "Qty(L)", "Price/L", "Fat", "Type", "Total", "Note"]);
    doc.moveTo(X, doc.y + 2).lineTo(540, doc.y + 2).strokeColor("#999").stroke();
    doc.moveDown(0.6);

    // Rows
// add a little vertical gap before rows render
const TOP_OFFSET_PT = 8;      // ~8 points ≈ 2–3px on A4 at 72dpi
doc.y += TOP_OFFSET_PT;       // or: doc.moveDown(TOP_OFFSET_PT / doc.currentLineHeight());

// now render rows
entries.forEach(e => {
  const d  = new Date(e.date);
  const dd = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

  const isLeave =
    (e.quantity === "" || e.quantity == null) &&
    (e.pricePerLitre === "" || e.pricePerLitre == null) &&
    (e.total === "" || e.total == null) &&
    (e.fat === "" || e.fat == null) &&
    (e.type === "" || e.type == null) &&
    (e.sent === "" || e.sent == null);

  line(doc.y, [
    dd,
    isLeave ? "—" : (e.quantity ?? "—"),
    isLeave ? "—" : (e.pricePerLitre ?? "—"),
    isLeave ? "—" : (e.fat ?? "—"),
    isLeave ? "—" : (e.type ?? "—"),
    isLeave ? "—" : (e.total ?? "—"),
    isLeave ? "holiday" : (e.sent ? "received" : "")
  ]);
  doc.moveDown(0.6);
});


    doc.moveDown(0.6);
    doc.moveTo(X, doc.y).lineTo(540, doc.y).strokeColor("#999").stroke();
    doc.moveDown(0.4);

    // Footer totals
    doc.fontSize(12).fillColor("#111");
    doc.text(`Total litres: ${totalLitres.toFixed(2)} L`);
    doc.text(`Total amount: ${totalAmount.toFixed(2)}`, { continued: false });

    doc.end();
  } catch (err) {
    console.error("generateMonthlyBill error:", err);
    return res.status(500).json({ message: "Server error while generating bill" });
  }
};

