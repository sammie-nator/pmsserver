const Property = require("../models/Property");
const Tenant = require("../models/Tenant");
const Billing = require("../models/Billing");
const Maintenance = require("../models/Maintenance");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/dashboard/summary - full picture, admin only
const adminSummary = asyncHandler(async (req, res) => {
  const [totalProperties, vacant, occupied, underMaintenance, deactivatedProperties, activeTenants, openIssues, urgentIssues] =
    await Promise.all([
      Property.countDocuments({ status: { $ne: "deactivated" } }),
      Property.countDocuments({ status: "vacant" }),
      Property.countDocuments({ status: "occupied" }),
      Property.countDocuments({ status: "maintenance" }),
      Property.countDocuments({ status: "deactivated" }),
      Tenant.countDocuments({ status: "active" }),
      Maintenance.countDocuments({ status: { $ne: "resolved" } }),
      Maintenance.countDocuments({ status: { $ne: "resolved" }, priority: "urgent" }),
    ]);

  const [revenueAgg] = await Billing.aggregate([
    { $match: { status: "paid" } },
    { $group: { _id: null, total: { $sum: "$paidAmount" } } },
  ]);
  const [outstandingAgg] = await Billing.aggregate([
    { $match: { status: { $in: ["pending", "partial", "overdue"] } } },
    { $group: { _id: null, total: { $sum: { $subtract: ["$amount", "$paidAmount"] } } } },
  ]);
  const pendingCount = await Billing.countDocuments({ status: { $ne: "paid" } });

  const byCategory = await Property.aggregate([{ $match: { status: { $ne: "deactivated" } } }, { $group: { _id: "$category", count: { $sum: 1 } } }]);
  const byArea = await Property.aggregate([{ $match: { status: { $ne: "deactivated" } } }, { $group: { _id: "$area", count: { $sum: 1 } } }]);

  res.json({
    properties: {
      total: totalProperties,
      vacant,
      occupied,
      maintenance: underMaintenance,
      deactivated: deactivatedProperties,
      occupancyRate: totalProperties ? Math.round((occupied / totalProperties) * 100) : 0,
      byCategory: byCategory.map((c) => ({ category: c._id, count: c.count })),
      byArea: byArea.map((a) => ({ area: a._id, count: a.count })),
    },
    tenants: { active: activeTenants },
    billing: {
      totalCollected: revenueAgg?.total || 0,
      outstanding: outstandingAgg?.total || 0,
      // Every invoice that hasn't been fully receipted counts as pending -
      // "overdue" alone understated how many bills actually need chasing.
      pendingCount,
    },
    maintenance: { open: openIssues, urgent: urgentIssues },
  });
});

// GET /api/dashboard/agent-summary - the same idea, scoped to what agents can see
const agentSummary = asyncHandler(async (req, res) => {
  const [totalProperties, vacant, occupied, underMaintenance, openIssues] = await Promise.all([
    Property.countDocuments({}),
    Property.countDocuments({ status: "vacant" }),
    Property.countDocuments({ status: "occupied" }),
    Property.countDocuments({ status: "maintenance" }),
    Maintenance.countDocuments({ status: { $ne: "resolved" } }),
  ]);
  const byArea = await Property.aggregate([{ $group: { _id: "$area", count: { $sum: 1 } } }]);

  res.json({
    properties: { total: totalProperties, vacant, occupied, maintenance: underMaintenance, byArea: byArea.map((a) => ({ area: a._id, count: a.count })) },
    maintenance: { open: openIssues },
  });
});

// Turns "2026-01".."2026-06" into a list of {year, month, label} entries,
// inclusive on both ends. Capped so a bad input can't generate forever.
function buildMonthRange(start, end) {
  if (!start) return [];
  const [sy, sm] = start.split("-").map(Number);
  if (!sy || !sm) return [];
  const [ey, em] = (end || start).split("-").map(Number);
  const eYear = ey || sy;
  const eMonth = em || sm;

  let y = sy;
  let m = sm;
  const out = [];
  let guard = 0;
  while ((y < eYear || (y === eYear && m <= eMonth)) && guard < 120) {
    out.push({ year: y, month: m, label: `${y}-${String(m).padStart(2, "0")}` });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

// GET /api/dashboard/revenue?start=YYYY-MM&end=YYYY-MM - admin only.
// "Expected" assumes every unit is occupied at its current rent for the
// whole month; "actual" sums what was actually paid (paidDate) in that
// month, across all types.
const revenueReport = asyncHandler(async (req, res) => {
  const months = buildMonthRange(req.query.start, req.query.end);
  if (!months.length) return res.status(400).json({ error: "Provide a valid start month (YYYY-MM), optionally an end month too." });

  const properties = await Property.find({}).select("monthlyRent");
  const expectedPerMonth = properties.reduce((sum, p) => sum + (p.monthlyRent || 0), 0);

  const rangeStart = new Date(months[0].year, months[0].month - 1, 1);
  const rangeEndExclusive = new Date(months[months.length - 1].year, months[months.length - 1].month, 1);

  const paidAgg = await Billing.aggregate([
    { $match: { paidDate: { $gte: rangeStart, $lt: rangeEndExclusive }, paidAmount: { $gt: 0 } } },
    { $group: { _id: { y: { $year: "$paidDate" }, m: { $month: "$paidDate" } }, total: { $sum: "$paidAmount" } } },
  ]);
  const paidMap = new Map(paidAgg.map((r) => [`${r._id.y}-${r._id.m}`, r.total]));

  const monthRows = months.map((mo) => ({
    month: mo.label,
    expected: expectedPerMonth,
    actual: paidMap.get(`${mo.year}-${mo.month}`) || 0,
  }));

  const totals = monthRows.reduce(
    (acc, r) => ({ expected: acc.expected + r.expected, actual: acc.actual + r.actual }),
    { expected: 0, actual: 0 }
  );

  res.json({ months: monthRows, totals, expectedPerMonth });
});

// GET /api/dashboard/maintenance-costs?start=&end= - admin only. Rolled up
// to monthly totals and a per-building total - never individual issues or
// which tenant reported what, so this stays a financial view, not a
// tenant-activity leak.
const maintenanceCostReport = asyncHandler(async (req, res) => {
  const months = buildMonthRange(req.query.start, req.query.end);
  if (!months.length) return res.status(400).json({ error: "Provide a valid start month (YYYY-MM), optionally an end month too." });

  const rangeStart = new Date(months[0].year, months[0].month - 1, 1);
  const rangeEndExclusive = new Date(months[months.length - 1].year, months[months.length - 1].month, 1);

  const issues = await Maintenance.find({ dateReported: { $gte: rangeStart, $lt: rangeEndExclusive } })
    .populate("property", "name buildingName")
    .select("property estimatedCost dateReported");

  const byMonthMap = new Map();
  const byBuildingMap = new Map();

  for (const issue of issues) {
    const cost = issue.estimatedCost || 0;
    const d = new Date(issue.dateReported);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    byMonthMap.set(key, (byMonthMap.get(key) || 0) + cost);

    const buildingName = issue.property?.buildingName || issue.property?.name || "Unassigned";
    if (!byBuildingMap.has(buildingName)) byBuildingMap.set(buildingName, { buildingName, total: 0, issueCount: 0 });
    const b = byBuildingMap.get(buildingName);
    b.total += cost;
    b.issueCount += 1;
  }

  const monthRows = months.map((mo) => ({ month: mo.label, total: byMonthMap.get(`${mo.year}-${mo.month}`) || 0 }));
  const totalCost = monthRows.reduce((sum, r) => sum + r.total, 0);
  const byBuilding = Array.from(byBuildingMap.values()).sort((a, b) => b.total - a.total);

  res.json({ months: monthRows, totalCost, byBuilding });
});

// GET /api/dashboard/property-report?key=&type=&start=&end= - admin only.
// "key" is a buildingName (reports across every unit in that building) or,
// for a standalone unit, its property _id. "type" narrows to rent,
// deposit, utility, penalty, or other - "expected" is only meaningful for
// rent (the one recurring, predictable figure), so it's 0 for the rest.
const propertyReport = asyncHandler(async (req, res) => {
  const { key, type } = req.query;
  if (!key) return res.status(400).json({ error: "A building or property is required." });

  const months = buildMonthRange(req.query.start, req.query.end);
  if (!months.length) return res.status(400).json({ error: "Provide a valid start month (YYYY-MM), optionally an end month too." });

  let properties = await Property.find({ buildingName: key });
  if (properties.length === 0) {
    const single = await Property.findById(key).catch(() => null);
    if (single) properties = [single];
  }
  if (properties.length === 0) return res.status(404).json({ error: "Building or property not found." });

  const propertyIds = properties.map((p) => p._id);
  const rangeStart = new Date(months[0].year, months[0].month - 1, 1);
  const rangeEndExclusive = new Date(months[months.length - 1].year, months[months.length - 1].month, 1);
  const typeFilter = type && type !== "all" ? { type } : {};

  const paidAgg = await Billing.aggregate([
    { $match: { property: { $in: propertyIds }, paidDate: { $gte: rangeStart, $lt: rangeEndExclusive }, paidAmount: { $gt: 0 }, ...typeFilter } },
    { $group: { _id: { y: { $year: "$paidDate" }, m: { $month: "$paidDate" } }, total: { $sum: "$paidAmount" } } },
  ]);
  const paidMap = new Map(paidAgg.map((r) => [`${r._id.y}-${r._id.m}`, r.total]));

  const expectedPerMonth = !type || type === "all" || type === "rent" ? properties.reduce((sum, p) => sum + (p.monthlyRent || 0), 0) : 0;

  const monthRows = months.map((mo) => ({
    month: mo.label,
    expected: expectedPerMonth,
    actual: paidMap.get(`${mo.year}-${mo.month}`) || 0,
  }));
  const totals = monthRows.reduce((acc, r) => ({ expected: acc.expected + r.expected, actual: acc.actual + r.actual }), { expected: 0, actual: 0 });

  res.json({
    buildingName: properties[0].buildingName || properties[0].name,
    area: properties[0].area,
    unitCount: properties.length,
    months: monthRows,
    totals,
  });
});

// GET /api/dashboard/building-insights - admin only. Per-building rollup of
// occupancy, all-time rent collected, and all-time maintenance spend, so
// you can see which buildings are actually earning their keep.
const buildingInsights = asyncHandler(async (req, res) => {
  const properties = await Property.find({}).select("buildingName name area monthlyRent status");

  const groupsMap = new Map();
  for (const p of properties) {
    const key = p.buildingName || p.name;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, { buildingName: key, area: p.area, ids: [], totalUnits: 0, occupiedUnits: 0, monthlyRentPotential: 0 });
    }
    const g = groupsMap.get(key);
    g.ids.push(p._id);
    g.totalUnits += 1;
    if (p.status === "occupied") g.occupiedUnits += 1;
    g.monthlyRentPotential += p.monthlyRent || 0;
  }

  const [collectedAgg, maintenanceAgg] = await Promise.all([
    Billing.aggregate([{ $match: { paidAmount: { $gt: 0 } } }, { $group: { _id: "$property", total: { $sum: "$paidAmount" } } }]),
    Maintenance.aggregate([{ $match: { paidAmount: { $gt: 0 } } }, { $group: { _id: "$property", total: { $sum: "$paidAmount" } } }]),
  ]);
  const collectedByProperty = new Map(collectedAgg.map((r) => [String(r._id), r.total]));
  const maintenanceByProperty = new Map(maintenanceAgg.map((r) => [String(r._id), r.total]));

  const buildings = Array.from(groupsMap.values())
    .map((g) => {
      const collected = g.ids.reduce((s, id) => s + (collectedByProperty.get(String(id)) || 0), 0);
      const maintenanceCost = g.ids.reduce((s, id) => s + (maintenanceByProperty.get(String(id)) || 0), 0);
      return {
        buildingName: g.buildingName,
        area: g.area,
        totalUnits: g.totalUnits,
        occupiedUnits: g.occupiedUnits,
        occupancyRate: g.totalUnits ? Math.round((g.occupiedUnits / g.totalUnits) * 100) : 0,
        monthlyRentPotential: g.monthlyRentPotential,
        allTimeCollected: collected,
        allTimeMaintenanceCost: maintenanceCost,
        netAllTime: collected - maintenanceCost,
      };
    })
    .sort((a, b) => b.allTimeCollected - a.allTimeCollected);

  res.json({ buildings });
});

module.exports = { adminSummary, agentSummary, revenueReport, maintenanceCostReport, propertyReport, buildingInsights };
