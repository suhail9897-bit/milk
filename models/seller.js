// E:\useful app\backend\models\seller.js
import mongoose from "mongoose";

const sellerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    password: { type: String, required: true, select: false }, // hash store hoga
    passwordPlain: { type: String, select: false },    
    address: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// email optional hote hue unique banane ke liye partial index:
sellerSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

export default mongoose.model("Seller", sellerSchema);
