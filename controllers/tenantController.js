const Tenant = require("../models/Tenant");
const Property = require("../models/Property");
const asyncHandler = require("../utils/asyncHandler");

const POPULATE_PROPERTY = "name category area status monthlyRent buildingName floorLabel unitCode";

// GET /api/tenants?status=&search=&property=
// GET /api/tenants/stats - counts only, so dashboards don't have to pull
// down every tenant just to show a number.
const tenantStats = asyncHandler(async (req, res) => {
  const [active, pending, former] = await Promise.all([
    Tenant.countDocuments({ status: "active" }),
    Tenant.countDocuments({ status: "pending" }),
    Tenant.countDocuments({ status: "former" }),
  ]);
  res.json({ active, pending, former: req.actor.role === "admin" ? former : undefined });
});

const listTenants = asyncHandler(async (req, res) => {
  const { status, search, property } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (property) filter.property = property;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { idNumber: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // Vacated tenants are only visible to admins - everyone else's view
  // silently excludes them, regardless of what they asked for.
  if (req.actor.role !== "admin") {
    filter.status = filter.status === "former" ? { $ne: "former" } : filter.status || { $ne: "former" };
  }

  const tenants = await Tenant.find(filter)
    .populate("property", POPULATE_PROPERTY)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 50, 100));
  res.json(tenants);
});

const getTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id)
    .populate("property", POPULATE_PROPERTY)
    .populate("history.property", POPULATE_PROPERTY);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  if (tenant.status === "former" && req.actor.role !== "admin") {
    return res.status(404).json({ error: "Tenant not found" });
  }
  res.json(tenant);
});

// POST /api/tenants - admin or frontdesk
const createTenant = asyncHandler(async (req, res) => {
  const {
    fullName,
    phone,
    email,
    idNumber,
    occupation,
    emergencyContactName,
    emergencyContactPhone,
    occupants,
    property,
    moveInDate,
    leaseEndDate,
  } = req.body;

  if (!fullName || !phone) {
    return res.status(400).json({ error: "fullName and phone are required." });
  }

  let propertyDoc = null;
  if (property) {
    propertyDoc = await Property.findById(property);
    if (!propertyDoc) return res.status(400).json({ error: "Selected property was not found." });
    if (propertyDoc.status === "deactivated") {
      return res.status(400).json({ error: "This property is deactivated and can't be assigned to a tenant." });
    }
  }

  const tenant = await Tenant.create({
    fullName,
    phone,
    email,
    idNumber,
    occupation,
    emergencyContactName,
    emergencyContactPhone,
    occupants,
    property: property || null,
    moveInDate,
    leaseEndDate,
    status: property ? "active" : "pending",
    history: property
      ? [
          {
            property,
            propertyName: propertyDoc.name,
            startDate: moveInDate || new Date(),
            monthlyRentAtTime: propertyDoc.monthlyRent,
          },
        ]
      : [],
  });

  if (propertyDoc) {
    propertyDoc.status = "occupied";
    await propertyDoc.save();
  }

  const populated = await tenant.populate("property", POPULATE_PROPERTY);
  res.status(201).json(populated);
});

// PATCH /api/tenants/:id - admin or frontdesk. Handles reassignment to a new
// property by closing out the old history entry and opening a new one.
const updateTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  // Deactivating a tenant (marking them former / clearing their unit) is an
  // admin-only action - use PATCH /:id/deactivate instead. Front desk can
  // still edit details and reassign to a *new* occupied unit.
  const wantsFormer = req.body.status === "former";
  const wantsVacate = req.body.property !== undefined && !req.body.property;
  if ((wantsFormer || wantsVacate) && req.actor.role !== "admin") {
    return res.status(403).json({ error: "Deactivating a tenant is an admin-only action." });
  }

  const simpleFields = [
    "fullName",
    "phone",
    "email",
    "idNumber",
    "occupation",
    "emergencyContactName",
    "emergencyContactPhone",
    "occupants",
    "leaseEndDate",
    "status",
  ];
  for (const f of simpleFields) {
    if (req.body[f] !== undefined) tenant[f] = req.body[f];
  }

  const newPropertyId = req.body.property;
  const isReassignment =
    newPropertyId !== undefined && String(tenant.property || "") !== String(newPropertyId || "");

  if (isReassignment) {
    const oldPropertyId = tenant.property;

    // Close out the currently-open history entry, if any.
    const openEntry = tenant.history.find((h) => !h.endDate);
    if (openEntry) openEntry.endDate = new Date();

    if (newPropertyId) {
      const newProperty = await Property.findById(newPropertyId);
      if (!newProperty) return res.status(400).json({ error: "Selected property was not found." });
      if (newProperty.status === "deactivated") {
        return res.status(400).json({ error: "This property is deactivated and can't be assigned to a tenant." });
      }

      tenant.property = newProperty._id;
      tenant.moveInDate = req.body.moveInDate || new Date();
      tenant.status = "active";
      tenant.history.push({
        property: newProperty._id,
        propertyName: newProperty.name,
        startDate: tenant.moveInDate,
        monthlyRentAtTime: newProperty.monthlyRent,
      });

      newProperty.status = "occupied";
      await newProperty.save();
    } else {
      tenant.property = null;
      tenant.status = "former";
    }

    if (oldPropertyId && String(oldPropertyId) !== String(newPropertyId)) {
      const stillOccupied = await Tenant.exists({
        _id: { $ne: tenant._id },
        property: oldPropertyId,
        status: "active",
      });
      if (!stillOccupied) {
        await Property.findByIdAndUpdate(oldPropertyId, { status: "vacant" });
      }
    }
  } else if (req.body.moveInDate !== undefined) {
    tenant.moveInDate = req.body.moveInDate;
  }

  await tenant.save();
  const populated = await tenant.populate("property", POPULATE_PROPERTY);
  res.json(populated);
});

// PATCH /api/tenants/:id/deactivate - admin only. The tenant record is kept
// (for records/history) but marked "former", unlinked from their unit, and
// that unit is freed up as vacant. Former tenants are excluded from every
// other view for privacy - only admins can see this list.
const deactivateTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  const oldPropertyId = tenant.property;
  const openEntry = tenant.history.find((h) => !h.endDate);
  if (openEntry) {
    openEntry.endDate = new Date();
    if (req.body.reason) openEntry.reasonForLeaving = req.body.reason;
  }

  tenant.property = null;
  tenant.status = "former";
  await tenant.save();

  if (oldPropertyId) {
    const stillOccupied = await Tenant.exists({ _id: { $ne: tenant._id }, property: oldPropertyId, status: "active" });
    if (!stillOccupied) {
      await Property.findByIdAndUpdate(oldPropertyId, { status: "vacant" });
    }
  }

  const populated = await tenant.populate("property", POPULATE_PROPERTY);
  res.json(populated);
});

// DELETE /api/tenants/:id - admin only
const deleteTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findByIdAndDelete(req.params.id);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  if (tenant.property) {
    const stillOccupied = await Tenant.exists({ property: tenant.property, status: "active" });
    if (!stillOccupied) {
      await Property.findByIdAndUpdate(tenant.property, { status: "vacant" });
    }
  }
  res.json({ success: true });
});

const addComment = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment text is required." });

  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  tenant.comments.push({ text: text.trim(), authorName: req.actor.name, authorRole: req.actor.role });
  await tenant.save();
  res.status(201).json(tenant.comments[tenant.comments.length - 1]);
});

module.exports = {
  listTenants,
  tenantStats,
  getTenant,
  createTenant,
  updateTenant,
  deactivateTenant,
  deleteTenant,
  addComment,
};
