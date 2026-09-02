const mongoose = require("mongoose");
const commentSchema = require("./commentSchema");

const billingSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    // e.g. "JM-00001" - tenant initials + a global sequence number, unique
    // across every invoice ever created (see Counter model).
    invoiceNumber: { type: String, unique: true, sparse: true },
    type: {
      type: String,
      enum: ["rent", "deposit", "utility", "penalty", "other"],
      default: "rent",
    },
    billingPeriod: { type: String, trim: true, default: "" }, // e.g. "2026-07"
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "partial", "paid", "overdue"],
      default: "pending",
    },
    paidAmount: { type: Number, default: 0, min: 0 },
    paidDate: { type: Date },
    paymentMethod: {
      type: String,
      enum: ["mpesa", "bank", "cash", "other", ""],
      default: "",
    },
    reference: { type: String, trim: true, default: "" }, // e.g. M-Pesa code
    comments: [commentSchema],
  },
  { timestamps: true }
);

billingSchema.index({ tenant: 1, status: 1 });
billingSchema.index({ dueDate: 1 });

module.exports = mongoose.model("Billing", billingSchema);
