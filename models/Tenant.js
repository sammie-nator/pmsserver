const mongoose = require("mongoose");
const commentSchema = require("./commentSchema");

// One entry per property this tenant has occupied, so moving them between
// units keeps a full paper trail instead of overwriting anything.
const tenancyHistorySchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
    propertyName: { type: String, trim: true }, // snapshot, survives property deletion
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    monthlyRentAtTime: { type: Number },
    reasonForLeaving: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

const tenantSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: "" },
    idNumber: { type: String, trim: true, default: "" },
    occupation: { type: String, trim: true, default: "" },
    emergencyContactName: { type: String, trim: true, default: "" },
    emergencyContactPhone: { type: String, trim: true, default: "" },
    occupants: { type: Number, default: 1, min: 1 },

    // Current assignment
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null },
    moveInDate: { type: Date },
    leaseEndDate: { type: Date },
    status: {
      type: String,
      enum: ["active", "former", "pending"],
      default: "pending",
    },

    history: [tenancyHistorySchema],
    comments: [commentSchema],
  },
  { timestamps: true }
);

tenantSchema.index({ fullName: "text", phone: "text", idNumber: "text" });

module.exports = mongoose.model("Tenant", tenantSchema);
