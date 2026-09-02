const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/audit?date=YYYY-MM-DD&role=&actor=&limit= - date is the primary
// lens: pick a day, see what happened that day, with full timestamps. No
// date means "everything", capped and most-recent-first, for the rare case
// someone wants a broader sweep.
const listAudit = asyncHandler(async (req, res) => {
  const { role, actor, date, limit } = req.query;
  const filter = {};
  if (role) filter.actorRole = role;
  if (actor) filter.actorName = actor;
  if (date) {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    filter.createdAt = { $gte: dayStart, $lt: dayEnd };
  }

  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 200, 500));
  res.json(logs);
});

// GET /api/audit/actors - distinct list of people who have activity logged
const listActors = asyncHandler(async (req, res) => {
  const actors = await AuditLog.aggregate([
    { $group: { _id: { name: "$actorName", role: "$actorRole" }, count: { $sum: 1 }, lastActive: { $max: "$createdAt" } } },
    { $sort: { lastActive: -1 } },
  ]);
  res.json(actors.map((a) => ({ name: a._id.name, role: a._id.role, count: a.count, lastActive: a.lastActive })));
});

module.exports = { listAudit, listActors };
