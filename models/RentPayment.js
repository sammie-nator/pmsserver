const mongoose = require("mongoose");

const rentPaymentSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    propertyName: { type: String, default: "" },
    unitCode: { type: String, default: "" },
    buildingName: { type: String, default: "" },
    amount: { type: Number, required: true, min: 1 },
    phone: { type: String, required: true }, // 2547...
    // M-Pesa
    merchantRequestId: { type: String, default: "" },
    checkoutRequestId: { type: String, default: "", index: true },
    mpesaReceipt: { type: String, default: "" },
    resultCode: { type: String, default: "" },
    resultDesc: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RentPayment", rentPaymentSchema);
