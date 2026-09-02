const Property = require("../models/Property");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/properties?area=&category=&status=&search=
const listProperties = asyncHandler(async (req, res) => {
  const { area, category, status, search } = req.query;
  const filter = {};
  if (area) filter.area = area;
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { area: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
    ];
  }

  // Agents get a strictly limited view: no financials, no comments -
  // just enough to know what's out there and where.
  const projection =
    req.actor.role === "agent"
      ? "name category description area status bedrooms bathrooms"
      : "";

  const properties = await Property.find(filter, projection).sort({ createdAt: -1 });
  res.json(properties);
});

const getProperty = asyncHandler(async (req, res) => {
  const projection =
    req.actor.role === "agent"
      ? "name category description area status bedrooms bathrooms"
      : "";
  const property = await Property.findById(req.params.id, projection);
  if (!property) return res.status(404).json({ error: "Property not found" });
  res.json(property);
});

// POST /api/properties - admin only (enforced by route middleware too)
const createProperty = asyncHandler(async (req, res) => {
  const {
    name,
    category,
    description,
    area,
    address,
    monthlyRent,
    deposit,
    bedrooms,
    bathrooms,
    sizeSqm,
    amenities,
    imageUrl,
  } = req.body;

  if (!name || !category || !description || !area || monthlyRent == null) {
    return res.status(400).json({
      error: "name, category, description, area, and monthlyRent are required.",
    });
  }

  const property = await Property.create({
    name,
    category,
    description,
    area,
    address,
    monthlyRent,
    deposit,
    bedrooms,
    bathrooms,
    sizeSqm,
    amenities,
    imageUrl,
  });
  res.status(201).json(property);
});

// Ground floor -> "G", then 1, 2, 3... Units within a floor are lettered
// A, B, C... (up to Z, which is far more units per floor than realistic).
function letterFor(index) {
  return String.fromCharCode(65 + index); // 0 -> A, 1 -> B, ...
}

// POST /api/properties/building - admin only. Creates a whole building in
// one go: give it a name + area, then describe each floor (how many units,
// what category/bedroom count, rent) and this generates one Property per
// unit with codes like GA, GB, GC (ground floor) then 1A, 1B, 1C (1st
// floor), 2A, 2B... and so on.
const createBuildingWithFloors = asyncHandler(async (req, res) => {
  const { buildingName, area, address, description, deposit, amenities, imageUrl, floors } = req.body;

  if (!buildingName || !area || !Array.isArray(floors) || floors.length === 0) {
    return res.status(400).json({
      error: "buildingName, area, and at least one floor are required.",
    });
  }

  const docs = [];
  floors.forEach((floor, floorIndex) => {
    const {
      floorNumber, // 0 = ground, 1 = first, ...
      floorLabel, // optional override, defaults to "G" for 0, else the number
      unitsCount,
      category,
      bedrooms,
      bathrooms,
      monthlyRent,
      sizeSqm,
    } = floor;

    const resolvedFloorNumber = floorNumber != null ? Number(floorNumber) : floorIndex;
    const label = floorLabel || (resolvedFloorNumber === 0 ? "G" : String(resolvedFloorNumber));
    const count = Number(unitsCount) || 0;

    for (let u = 0; u < count; u++) {
      const unitCode = `${label}${letterFor(u)}`;
      docs.push({
        name: `${buildingName} - ${unitCode}`,
        category: category || "one-bedroom",
        description: description || `Unit ${unitCode} at ${buildingName}.`,
        area,
        address,
        monthlyRent: Number(monthlyRent) || 0,
        deposit: deposit != null ? Number(deposit) : 0,
        bedrooms: bedrooms != null ? Number(bedrooms) : 0,
        bathrooms: bathrooms != null ? Number(bathrooms) : 0,
        sizeSqm: sizeSqm != null ? Number(sizeSqm) : undefined,
        amenities: amenities || [],
        imageUrl: imageUrl || "",
        buildingName,
        floorLabel: label,
        floorNumber: resolvedFloorNumber,
        unitCode,
      });
    }
  });

  if (docs.length === 0) {
    return res.status(400).json({ error: "Each floor needs at least one unit." });
  }

  const created = await Property.insertMany(docs, { ordered: true });
  res.status(201).json(created);
});

const updateProperty = asyncHandler(async (req, res) => {
  const existing = await Property.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Property not found" });

  // Deactivating an occupied unit would silently orphan a tenant's link to
  // it - vacate them first (Tenants > Deactivate) so nothing dangles.
  if (req.body.status === "deactivated" && existing.status === "occupied") {
    return res.status(400).json({ error: "This unit is occupied. Reassign or deactivate the tenant first, then deactivate the unit." });
  }

  const fields = [
    "name",
    "category",
    "description",
    "area",
    "address",
    "monthlyRent",
    "deposit",
    "status",
    "bedrooms",
    "bathrooms",
    "sizeSqm",
    "amenities",
    "imageUrl",
    "buildingName",
    "floorLabel",
    "floorNumber",
    "unitCode",
  ];
  const update = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) update[f] = req.body[f];
  }

  const property = await Property.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!property) return res.status(404).json({ error: "Property not found" });
  res.json(property);
});

// DELETE /api/properties/:id - admin only
const deleteProperty = asyncHandler(async (req, res) => {
  const property = await Property.findByIdAndDelete(req.params.id);
  if (!property) return res.status(404).json({ error: "Property not found" });
  res.json({ success: true });
});

const addComment = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment text is required." });

  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ error: "Property not found" });

  property.comments.push({ text: text.trim(), authorName: req.actor.name, authorRole: req.actor.role });
  await property.save();
  res.status(201).json(property.comments[property.comments.length - 1]);
});

// GET /api/properties/meta/categories - the fixed category list + areas in use
const getMeta = asyncHandler(async (req, res) => {
  const areas = await Property.distinct("area");
  res.json({ categories: Property.CATEGORIES, areas: areas.sort() });
});

module.exports = {
  listProperties,
  getProperty,
  createProperty,
  createBuildingWithFloors,
  updateProperty,
  deleteProperty,
  addComment,
  getMeta,
};
