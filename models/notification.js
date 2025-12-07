// models/notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    seller:   { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },

    // only these two per your request
    type: { type: String, enum: ["send", "leave"], required: true },

    // link to the milk entry (if available)
    entryId: { type: mongoose.Schema.Types.ObjectId },

    // snapshot so UI message bana sake without extra DB hits
    date: { type: Date, required: true },
    quantity: { type: Number },        // for "send"
    pricePerLitre: { type: Number },   // for "send"
    fat: { type: Number },             // for "send"
    milkType: { type: String },        // "cow" | "buffalo" | ""

    isRead: { type: Boolean, default: false }
  },
  { timestamps: true, collection: "notifications" }
);

export default mongoose.model("Notification", notificationSchema);
