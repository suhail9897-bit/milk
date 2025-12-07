// models/customer.js
import mongoose from "mongoose";

const milkEntrySchema = new mongoose.Schema({
  // ⬇️ _id auto-create hoga for each entry
  // (kuch likhne ki zaroorat nahi; sirf _id:false hatana hai)
  date: { type: Date, required: true },             // midnight-normalized
  quantity: { type: Number, required: true, min: 0 },
  pricePerLitre: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  fat: { type: Number, required: true, min: 0 },
  type: { type: String, enum: ["cow", "buffalo", "mix"], default: "buffalo" },
  sent: { type: Boolean, default: false },
}); // 👈 yahan koi options { _id:false } NAHIN

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    address: { type: String, trim: true },
    password: { type: String, required: true, select: false },
    passwordPlain: { type: String, select: false },            // <-- NEW: store raw
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    isActive: { type: Boolean, default: true },
    milkEntries: { type: [milkEntrySchema], default: [] },
  },
  { timestamps: true }
);

customerSchema.index({ seller: 1, phone: 1 });

export default mongoose.model("Customer", customerSchema);
