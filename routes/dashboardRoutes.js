const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/dashboardController");

const router = express.Router();

router.get("/summary", requireRole("admin"), ctrl.adminSummary);
router.get("/agent-summary", requireRole("admin", "agent"), ctrl.agentSummary);
router.get("/revenue", requireRole("admin"), ctrl.revenueReport);
router.get("/maintenance-costs", requireRole("admin"), ctrl.maintenanceCostReport);
router.get("/property-report", requireRole("admin"), ctrl.propertyReport);
router.get("/building-insights", requireRole("admin"), ctrl.buildingInsights);

module.exports = router;
