const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/balanceController");

const router = express.Router();

router.get("/", requireRole("admin", "agent", "frontdesk"), ctrl.listBalances);

module.exports = router;
