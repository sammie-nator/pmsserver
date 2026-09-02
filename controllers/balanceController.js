const Property = require("../models/Property");
const Tenant = require("../models/Tenant");
const Billing = require("../models/Billing");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/balances - built for agents on the ground: which units are
// occupied vs vacant, what a vacant unit rents for, and (for occupied
// units) just enough about the tenant to identify and contact them -
// name, phone, email, and their current balance. No ID numbers, no
// tenancy history, no comments. Grouped by building with an occupancy %.
const listBalances = asyncHandler(async (req, res) => {
  const properties = await Property.find({ status: { $ne: "deactivated" } }).select(
    "name area buildingName floorLabel unitCode category monthlyRent status"
  );
  const activeTenants = await Tenant.find({ status: "active", property: { $ne: null } }).select(
    "fullName phone email property"
  );

  const tenantByProperty = new Map();
  for (const t of activeTenants) tenantByProperty.set(String(t.property), t);

  const balanceAgg = await Billing.aggregate([
    { $match: { status: { $in: ["pending", "partial", "overdue"] } } },
    { $group: { _id: "$tenant", balance: { $sum: { $subtract: ["$amount", "$paidAmount"] } } } },
  ]);
  const balanceByTenant = new Map(balanceAgg.map((b) => [String(b._id), b.balance]));

  const groupsMap = new Map();
  for (const p of properties) {
    const key = p.buildingName || `unit:${p._id}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, { buildingName: p.buildingName || p.name, area: p.area, units: [] });
    }
    const tenant = tenantByProperty.get(String(p._id));
    groupsMap.get(key).units.push({
      id: p._id,
      code: p.unitCode || p.name,
      floorLabel: p.floorLabel || "",
      category: p.category,
      status: p.status,
      monthlyRent: p.monthlyRent,
      tenant: tenant
        ? {
            fullName: tenant.fullName,
            phone: tenant.phone,
            email: tenant.email,
            balance: balanceByTenant.get(String(tenant._id)) || 0,
          }
        : null,
    });
  }

  const buildings = Array.from(groupsMap.values())
    .map((g) => {
      const total = g.units.length;
      const occupied = g.units.filter((u) => u.status === "occupied").length;
      return {
        ...g,
        totalUnits: total,
        occupiedUnits: occupied,
        vacantUnits: total - occupied,
        occupancyRate: total ? Math.round((occupied / total) * 100) : 0,
      };
    })
    .sort((a, b) => a.buildingName.localeCompare(b.buildingName));

  res.json({ buildings });
});

module.exports = { listBalances };
