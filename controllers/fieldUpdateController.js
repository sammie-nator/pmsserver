const FieldUpdate = require("../models/FieldUpdate");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/field-updates?date=YYYY-MM-DD
const listFieldUpdates = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const filter = {};
  if (date) filter.date = date;

  const updates = await FieldUpdate.find(filter).sort({ date: -1, createdAt: -1 }).limit(300);
  res.json(updates);
});

// POST /api/field-updates
const createFieldUpdate = asyncHandler(async (req, res) => {
  const { locationsVisited, notes, date } = req.body;
  if (!notes || !notes.trim()) return res.status(400).json({ error: "Notes are required." });

  const update = await FieldUpdate.create({
    authorName: req.actor.name,
    authorRole: req.actor.role,
    date: date || new Date().toISOString().slice(0, 10),
    locationsVisited: locationsVisited || "",
    notes: notes.trim(),
  });
  res.status(201).json(update);
});

// DELETE /api/field-updates/:id - author or admin only
const deleteFieldUpdate = asyncHandler(async (req, res) => {
  const update = await FieldUpdate.findById(req.params.id);
  if (!update) return res.status(404).json({ error: "Update not found" });
  if (req.actor.role !== "admin" && update.authorName !== req.actor.name) {
    return res.status(403).json({ error: "You can only delete your own updates." });
  }
  await update.deleteOne();
  res.json({ success: true });
});

module.exports = { listFieldUpdates, createFieldUpdate, deleteFieldUpdate };
