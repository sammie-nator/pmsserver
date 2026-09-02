const mongoose = require("mongoose");

// A tiny generic counter, incremented atomically via findByIdAndUpdate's
// $inc - safe under concurrent requests, unlike counting existing
// documents (which can race and produce duplicates).
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "invoiceNumber"
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", counterSchema);
