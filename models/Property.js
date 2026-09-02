const mongoose = require("mongoose");
const commentSchema = require("./commentSchema");

const CATEGORIES = [
  "single-room",
  "bedsitter",
  "executive-bedsitter",
  "one-bedroom",
  "two-bedroom",
  "three-bedroom",
  "four-bedroom",
  "apartment",
  "other",
];

const propertySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Riverbank Court - GA"
    category: { type: String, enum: CATEGORIES, required: true },

    // Set when this unit was generated as part of a multi-floor building
    // (see createBuildingWithFloors). Lets units belonging to the same
    // building be grouped, and lets the tenant picker show "GA", "1B" etc.
    buildingName: { type: String, trim: true, default: "" },
    floorLabel: { type: String, trim: true, default: "" }, // "G", "1", "2"...
    floorNumber: { type: Number, default: null }, // 0 = ground, 1 = first...
    unitCode: { type: String, trim: true, default: "" }, // "GA", "1B", "2C"...
    // Every category requires its own description, as requested - what
    // makes this specific unit worth what it costs.
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    area: { type: String, required: true, trim: true }, // e.g. "Kilimani, Nairobi"
    address: { type: String, trim: true, default: "" },
    monthlyRent: { type: Number, required: true, min: 0 },
    deposit: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      // "deactivated" = no longer managed - kept for historical record,
      // but hidden from balances/assignment/occupancy everywhere else.
      enum: ["vacant", "occupied", "maintenance", "deactivated"],
      default: "vacant",
    },
    bedrooms: { type: Number, default: 0, min: 0 },
    bathrooms: { type: Number, default: 0, min: 0 },
    sizeSqm: { type: Number, min: 0 },
    amenities: [{ type: String, trim: true }],
    imageUrl: { type: String, default: "" },
    comments: [commentSchema],
  },
  { timestamps: true }
);

propertySchema.index({ area: 1, category: 1, status: 1 });
propertySchema.index({ buildingName: 1, unitCode: 1 });

propertySchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model("Property", propertySchema);
