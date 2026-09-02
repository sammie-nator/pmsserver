const AuditLog = require("../models/AuditLog");

// Only log requests that actually did something (or that represent an
// admin deliberately opening a page/data set) - GET /health etc are noise.
const SKIP_PATHS = ["/health", "/audit"];

function describe(req) {
  const { method, path: fullPath } = req; // e.g. "/properties/64f.../comments"
  const segments = fullPath.split("/").filter(Boolean);
  const section = segments[0] || "root";
  const rest = segments.slice(1).join("/");

  const verbs = { POST: "Created", PATCH: "Updated", PUT: "Updated", DELETE: "Deleted", GET: "Viewed" };
  const verb = verbs[method] || method;

  if (rest.endsWith("comments")) return `${verb} a comment on a ${section.slice(0, -1) || section}`;
  if (rest === "building") return `${verb} a building (bulk floors/units) in properties`;
  if (rest) return `${verb} ${section.slice(0, -1) || section} ${rest}`;
  return `${verb} ${section}`;
}

// Skips logging plain GET list/detail views by default (too noisy for an
// accountability trail) but always logs anything that changes data.
function attachAudit(req, res, next) {
  if (SKIP_PATHS.some((p) => req.path.startsWith(p))) return next();

  const shouldLog = req.method !== "GET"; // mutating actions only
  if (!shouldLog) return next();

  res.on("finish", () => {
    AuditLog.create({
      actorName: req.actor?.name || "Unknown",
      actorRole: req.actor?.role || "admin",
      method: req.method,
      path: req.originalUrl,
      action: describe(req),
      statusCode: res.statusCode,
    }).catch((err) => console.warn("Audit log write failed:", err.message));
  });

  next();
}

module.exports = { attachAudit };
