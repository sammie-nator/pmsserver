const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/rentPaymentAdminController");

const router = express.Router();

router.use(requireRole("admin"));
router.get("/", ctrl.listPayments);
router.get("/export.csv", ctrl.exportCsv);

module.exports = router;
