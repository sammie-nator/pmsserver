const mongoose = require("mongoose");

// One row per state-changing action (or explicit view) taken through the
// app, tagged with who did it and in what role. Powers the admin "audit
// trail" - select a staff member/role and see exactly what they clicked.
const auditLogSchema = new mongoose.Schema(
  {
    actorName: { type: String, default: "Unknown", trim: true },
    actorRole: { type: String, enum: ["admin", "agent", "frontdesk"], required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    action: { type: String, required: true }, // human-readable, e.g. "Created property"
    statusCode: { type: Number },
  },
  { timestamps: true }
);

auditLogSchema.index({ actorName: 1, createdAt: -1 });
auditLogSchema.index({ actorRole: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
