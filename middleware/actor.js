const ROLES = ["admin", "agent", "frontdesk"];

// There's no JWT/session auth yet. The frontend's role picker stores a
// chosen name + role locally and sends them as headers on every request.
// This middleware reads those headers so controllers know who's acting and
// requireRole() can gate sensitive operations. It's not a security boundary
// against a malicious client (there's no secret backing it) - it's there so
// the three panels behave correctly and comments/history are attributable.
// Swap this out for real auth (JWT/session) later without touching the
// controllers, since they only ever read req.actor.
function attachActor(req, res, next) {
  const role = ROLES.includes(req.header("x-role")) ? req.header("x-role") : "admin";
  const name = (req.header("x-actor-name") || "Unknown").slice(0, 100);
  req.actor = { role, name };
  next();
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.actor || !allowed.includes(req.actor.role)) {
      return res.status(403).json({
        error: `This action requires one of these roles: ${allowed.join(", ")}.`,
      });
    }
    next();
  };
}

module.exports = { attachActor, requireRole, ROLES };
