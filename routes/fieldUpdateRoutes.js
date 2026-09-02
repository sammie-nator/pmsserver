const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/fieldUpdateController");

const router = express.Router();

// Visible to fellow agents and management only - front desk doesn't need it.
router.use(requireRole("agent", "admin"));

router.get("/", ctrl.listFieldUpdates);
router.post("/", ctrl.createFieldUpdate);
router.delete("/:id", ctrl.deleteFieldUpdate);

module.exports = router;
