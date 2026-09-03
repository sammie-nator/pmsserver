const RentPayment = require("../models/RentPayment");
const asyncHandler = require("../utils/asyncHandler");

const listPayments = asyncHandler(async (req, res) => {
  const { status, from, to } = req.query;
  const filter = {};
  if (status) filter.status = status;
  else filter.status = "success";

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const payments = await RentPayment.find(filter).sort({ createdAt: -1 }).lean();
  res.json(payments);
});

const exportCsv = asyncHandler(async (req, res) => {
  const status = req.query.status || "success";
  const payments = await RentPayment.find({ status }).sort({ createdAt: -1 }).lean();

  const header = [
    "Date",
    "Building",
    "Unit",
    "Property",
    "Amount",
    "Phone",
    "MpesaReceipt",
    "Status",
  ];
  const rows = payments.map((p) =>
    [
      p.createdAt ? new Date(p.createdAt).toISOString() : "",
      p.buildingName,
      p.unitCode,
      p.propertyName,
      p.amount,
      p.phone,
      p.mpesaReceipt,
      p.status,
    ]
      .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="rent-payments.csv"');
  res.send(csv);
});

module.exports = { listPayments, exportCsv };
