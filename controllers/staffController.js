const Staff = require("../models/Staff");
const asyncHandler = require("../utils/asyncHandler");

const PIN_RE = /^\d{4,6}$/;

const listStaff = asyncHandler(async (req, res) => {
  const { role, includePin } = req.query;
  const filter = { active: true };
  if (role) filter.role = role;

  let q = Staff.find(filter).sort({ name: 1 });
  const isAdmin = req.actor?.role === "admin";
  if (!(includePin === "1" && isAdmin)) {
    q = q.select("-pin");
  }
  const staff = await q;
  res.json(staff);
});

const createStaff = asyncHandler(async (req, res) => {
  const { name, role, phone, email, assignedAreas, pin } = req.body;
  if (!name || !role) return res.status(400).json({ error: "name and role are required." });
  if (!pin || !PIN_RE.test(String(pin))) {
    return res.status(400).json({ error: "A PIN of 4 to 6 digits is required." });
  }
  const staff = await Staff.create({
    name,
    role,
    phone,
    email,
    assignedAreas,
    pin: String(pin),
  });
  res.status(201).json(staff);
});

const updateStaff = asyncHandler(async (req, res) => {
  const fields = ["name", "role", "phone", "email", "assignedAreas", "active", "pin"];
  const update = {};
  for (const f of fields) if (req.body[f] !== undefined) update[f] = req.body[f];

  if (update.pin !== undefined && !PIN_RE.test(String(update.pin))) {
    return res.status(400).json({ error: "PIN must be 4 to 6 digits." });
  }

  const staff = await Staff.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!staff) return res.status(404).json({ error: "Staff member not found" });
  res.json(staff);
});

const deleteStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findByIdAndDelete(req.params.id);
  if (!staff) return res.status(404).json({ error: "Staff member not found" });
  res.json({ success: true });
});

const verifyPin = asyncHandler(async (req, res) => {
  const { staffId, name, role, pin } = req.body;
  if (!pin || !PIN_RE.test(String(pin))) {
    return res.status(400).json({ error: "Enter your 4–6 digit PIN." });
  }

  let staff = null;
  if (staffId) {
    staff = await Staff.findOne({ _id: staffId, active: true });
  } else if (name && role) {
    staff = await Staff.findOne({ name: String(name).trim(), role, active: true });
  } else {
    return res.status(400).json({ error: "staffId or name+role required." });
  }

  if (!staff) return res.status(404).json({ error: "Staff member not found." });
  if (String(staff.pin) !== String(pin)) {
    return res.status(401).json({ error: "Incorrect PIN." });
  }

  res.json({
    ok: true,
    staff: {
      _id: staff._id,
      name: staff.name,
      role: staff.role,
      phone: staff.phone,
      email: staff.email,
      assignedAreas: staff.assignedAreas,
    },
  });
});

module.exports = { listStaff, createStaff, updateStaff, deleteStaff, verifyPin };
