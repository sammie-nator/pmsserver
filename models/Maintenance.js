const mongoose = require("mongoose");
const commentSchema = require("./commentSchema");

const maintenanceSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: {
      type: String,
      enum: ["plumbing", "electrical", "structural", "appliance", "pest", "other"],
      default: "other",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved"],
      default: "open",
    },
    reportedBy: { type: String, trim: true, default: "" },
    dateReported: { type: Date, default: Date.now },
    resolvedDate: { type: Date },
    estimatedCost: { type: Number, min: 0 },
    // Expense tracking - paying a contractor/vendor for this job. Kept
    // separate from tenant billing entirely; only admin/frontdesk record
    // these, agents never see cost figures.
    paidAmount: { type: Number, default: 0, min: 0 },
    paidDate: { type: Date },
    paymentMethod: { type: String, enum: ["mpesa", "bank", "cash", "other", ""], default: "" },
    paymentReference: { type: String, trim: true, default: "" },
    vendor: { type: String, trim: true, default: "" },
    comments: [commentSchema],
  },
  { timestamps: true }
);

maintenanceSchema.index({ property: 1, status: 1 });

module.exports = mongoose.model("Maintenance", maintenanceSchema);
