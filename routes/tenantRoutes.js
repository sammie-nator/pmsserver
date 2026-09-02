const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/tenantController");

const router = express.Router();

// Agents have no client history / tenant visibility at all, per the brief.
router.use(requireRole("admin", "frontdesk"));

router.get("/", ctrl.listTenants);
router.get("/stats", ctrl.tenantStats);
router.get("/:id", ctrl.getTenant);
router.post("/", ctrl.createTenant);
router.patch("/:id", ctrl.updateTenant);
router.patch("/:id/deactivate", requireRole("admin"), ctrl.deactivateTenant);
router.delete("/:id", requireRole("admin"), ctrl.deleteTenant);
router.post("/:id/comments", ctrl.addComment);

module.exports = router;
