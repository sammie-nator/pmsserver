const mongoose = require("mongoose");

// Lightweight staff directory. Role picker selects name + role; a PIN set by
// admin is required at sign-in (4–6 digits). Admin can view/edit PINs on the
// Staff page if someone loses theirs.
const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["admin", "agent", "frontdesk"], required: true },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    // PIN for sign-in (4–6 digits). Plain so admin can recover it.
    pin: {
      type: String,
      required: true,
      match: [/^\d{4,6}$/, "PIN must be 4 to 6 digits"],
    },
    assignedAreas: [{ type: String, trim: true }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Staff", staffSchema);
