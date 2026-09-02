const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/maintenanceController");

const router = express.Router();

// Maintenance is visible to everyone, incl. agents, per the brief.
router.get("/", ctrl.listMaintenance);
router.get("/:id", ctrl.getMaintenance);
router.post("/", ctrl.createMaintenance);
router.patch("/:id", ctrl.updateMaintenance);
router.patch("/:id/payment", requireRole("admin", "frontdesk"), ctrl.recordExpensePayment);
router.delete("/:id", requireRole("admin"), ctrl.deleteMaintenance);
router.post("/:id/comments", ctrl.addComment);

module.exports = router;
