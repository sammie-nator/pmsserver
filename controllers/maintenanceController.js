const Maintenance = require("../models/Maintenance");
const Property = require("../models/Property");
const asyncHandler = require("../utils/asyncHandler");

const POPULATE = { path: "property", select: "name area category status" };

// GET /api/maintenance?status=&property=&priority=
const listMaintenance = asyncHandler(async (req, res) => {
  const { status, property, priority } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (property) filter.property = property;
  if (priority) filter.priority = priority;

  const issues = await Maintenance.find(filter).populate(POPULATE).sort({ createdAt: -1 });
  res.json(issues);
});

const getMaintenance = asyncHandler(async (req, res) => {
  const issue = await Maintenance.findById(req.params.id).populate(POPULATE);
  if (!issue) return res.status(404).json({ error: "Maintenance issue not found" });
  res.json(issue);
});

// POST /api/maintenance - any role can log an issue (admin, agent, frontdesk)
const createMaintenance = asyncHandler(async (req, res) => {
  const { property, title, description, category, priority } = req.body;
  if (!property || !title || !description) {
    return res.status(400).json({ error: "property, title, and description are required." });
  }

  const propertyDoc = await Property.findById(property);
  if (!propertyDoc) return res.status(400).json({ error: "Selected property was not found." });

  const issue = await Maintenance.create({
    property,
    title,
    description,
    category,
    priority,
    reportedBy: req.actor.name,
  });

  if (propertyDoc.status === "vacant") {
    propertyDoc.status = "maintenance";
    await propertyDoc.save();
  }

  const populated = await issue.populate(POPULATE);
  res.status(201).json(populated);
});

// PATCH /api/maintenance/:id - admin/agent/frontdesk can update status;
// resolving frees the property back up if nothing else is holding it.
const updateMaintenance = asyncHandler(async (req, res) => {
  const issue = await Maintenance.findById(req.params.id);
  if (!issue) return res.status(404).json({ error: "Maintenance issue not found" });

  const fields = ["title", "description", "category", "priority", "status", "estimatedCost"];
  for (const f of fields) {
    if (req.body[f] !== undefined) issue[f] = req.body[f];
  }

  if (req.body.status === "resolved" && !issue.resolvedDate) {
    issue.resolvedDate = new Date();
    const property = await Property.findById(issue.property);
    if (property && property.status === "maintenance") {
      const stillOpen = await Maintenance.exists({
        _id: { $ne: issue._id },
        property: issue.property,
        status: { $ne: "resolved" },
      });
      if (!stillOpen) {
        property.status = "vacant";
        await property.save();
      }
    }
  }

  await issue.save();
  const populated = await issue.populate(POPULATE);
  res.json(populated);
});

// PATCH /api/maintenance/:id/payment - admin/frontdesk only. Records what
// was paid to a contractor/vendor for this job - an expense receipt, kept
// entirely separate from tenant billing.
const recordExpensePayment = asyncHandler(async (req, res) => {
  const issue = await Maintenance.findById(req.params.id);
  if (!issue) return res.status(404).json({ error: "Maintenance issue not found" });

  const { paidAmount, paymentMethod, reference, vendor, estimatedCost } = req.body;
  if (paidAmount == null) return res.status(400).json({ error: "paidAmount is required." });

  if (estimatedCost != null) issue.estimatedCost = Number(estimatedCost);
  issue.paidAmount = Number(paidAmount);
  issue.paidDate = new Date();
  if (paymentMethod !== undefined) issue.paymentMethod = paymentMethod;
  if (reference !== undefined) issue.paymentReference = reference;
  if (vendor !== undefined) issue.vendor = vendor;

  await issue.save();
  const populated = await issue.populate(POPULATE);
  res.json(populated);
});

// DELETE /api/maintenance/:id - admin only
const deleteMaintenance = asyncHandler(async (req, res) => {
  const issue = await Maintenance.findByIdAndDelete(req.params.id);
  if (!issue) return res.status(404).json({ error: "Maintenance issue not found" });
  res.json({ success: true });
});

const addComment = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment text is required." });

  const issue = await Maintenance.findById(req.params.id);
  if (!issue) return res.status(404).json({ error: "Maintenance issue not found" });

  issue.comments.push({ text: text.trim(), authorName: req.actor.name, authorRole: req.actor.role });
  await issue.save();
  res.status(201).json(issue.comments[issue.comments.length - 1]);
});

module.exports = { listMaintenance, getMaintenance, createMaintenance, updateMaintenance, recordExpensePayment, deleteMaintenance, addComment };
