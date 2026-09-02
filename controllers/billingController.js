const Billing = require("../models/Billing");
const Tenant = require("../models/Tenant");
const Counter = require("../models/Counter");
const asyncHandler = require("../utils/asyncHandler");

const POPULATE = [
  { path: "tenant", select: "fullName phone status" },
  { path: "property", select: "name area category" },
];

// e.g. "John Mwangi" -> "JM". Falls back to "XX" for a single/odd name.
function initialsFor(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "XX";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function nextInvoiceNumber(tenantName) {
  const counter = await Counter.findByIdAndUpdate("invoiceNumber", { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${initialsFor(tenantName)}-${String(counter.seq).padStart(5, "0")}`;
}

// GET /api/billing?status=&tenant=&type=
const listBilling = asyncHandler(async (req, res) => {
  const { status, tenant, type, property } = req.query;
  const filter = {};
  if (status) filter.status = status === "pending" ? { $ne: "paid" } : status;
  if (tenant) filter.tenant = tenant;
  if (property) filter.property = property;
  if (type) filter.type = type;

  const bills = await Billing.find(filter).populate(POPULATE).sort({ dueDate: -1 });
  res.json(bills);
});

const getBilling = asyncHandler(async (req, res) => {
  const bill = await Billing.findById(req.params.id).populate(POPULATE);
  if (!bill) return res.status(404).json({ error: "Billing record not found" });
  res.json(bill);
});

// POST /api/billing - admin or frontdesk
const createBilling = asyncHandler(async (req, res) => {
  const { tenant, type, billingPeriod, amount, dueDate, paymentMethod, reference } = req.body;
  if (!tenant || amount == null || !dueDate) {
    return res.status(400).json({ error: "tenant, amount, and dueDate are required." });
  }

  const tenantDoc = await Tenant.findById(tenant);
  if (!tenantDoc) return res.status(400).json({ error: "Selected tenant was not found." });
  if (!tenantDoc.property) {
    return res.status(400).json({ error: "This tenant has no assigned property to bill against." });
  }

  const bill = await Billing.create({
    tenant,
    property: tenantDoc.property,
    invoiceNumber: await nextInvoiceNumber(tenantDoc.fullName),
    type,
    billingPeriod,
    amount,
    dueDate,
    paymentMethod,
    reference,
  });

  const populated = await bill.populate(POPULATE);
  res.status(201).json(populated);
});

// PATCH /api/billing/:id - admin or frontdesk. Recording a payment updates
// status automatically based on paidAmount vs amount.
const updateBilling = asyncHandler(async (req, res) => {
  const bill = await Billing.findById(req.params.id);
  if (!bill) return res.status(404).json({ error: "Billing record not found" });

  const fields = ["type", "billingPeriod", "amount", "dueDate", "paidAmount", "paidDate", "paymentMethod", "reference", "status"];
  for (const f of fields) {
    if (req.body[f] !== undefined) bill[f] = req.body[f];
  }

  // If paidAmount changed and status wasn't explicitly set, infer it.
  if (req.body.paidAmount !== undefined && req.body.status === undefined) {
    if (bill.paidAmount <= 0) bill.status = new Date(bill.dueDate) < new Date() ? "overdue" : "pending";
    else if (bill.paidAmount >= bill.amount) {
      bill.status = "paid";
      if (!bill.paidDate) bill.paidDate = new Date();
    } else bill.status = "partial";
  }

  await bill.save();
  const populated = await bill.populate(POPULATE);
  res.json(populated);
});

// DELETE /api/billing/:id - admin only
const deleteBilling = asyncHandler(async (req, res) => {
  const bill = await Billing.findByIdAndDelete(req.params.id);
  if (!bill) return res.status(404).json({ error: "Billing record not found" });
  res.json({ success: true });
});

const addComment = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment text is required." });

  const bill = await Billing.findById(req.params.id);
  if (!bill) return res.status(404).json({ error: "Billing record not found" });

  bill.comments.push({ text: text.trim(), authorName: req.actor.name, authorRole: req.actor.role });
  await bill.save();
  res.status(201).json(bill.comments[bill.comments.length - 1]);
});

module.exports = { listBilling, getBilling, createBilling, updateBilling, deleteBilling, addComment };
