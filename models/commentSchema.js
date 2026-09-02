const mongoose = require("mongoose");

// A small, reusable "notes/comments" thread embedded on properties, tenants,
// billing records, and maintenance issues. authorName/authorRole come from
// the x-actor-name / x-role headers the frontend sends with every request
// (see middleware/actor.js) since there's no JWT-based auth yet.
const commentSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    authorName: { type: String, default: "Unknown" },
    authorRole: { type: String, enum: ["admin", "agent", "frontdesk"], default: "admin" },
  },
  { timestamps: true }
);

module.exports = commentSchema;
