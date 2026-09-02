const mongoose = require("mongoose");

// A short daily report an agent posts after being out in the field -
// what they visited, what they observed. Visible to fellow agents and
// management only (enforced in the routes, not here).
const fieldUpdateSchema = new mongoose.Schema(
  {
    authorName: { type: String, required: true, trim: true },
    authorRole: { type: String, enum: ["agent", "admin"], required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD" - groups reports by day regardless of timezone
    locationsVisited: { type: String, trim: true, default: "" },
    notes: { type: String, required: true, trim: true, maxlength: 3000 },
  },
  { timestamps: true }
);

fieldUpdateSchema.index({ date: -1 });

module.exports = mongoose.model("FieldUpdate", fieldUpdateSchema);
