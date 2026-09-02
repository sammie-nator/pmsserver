const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/auditController");

const router = express.Router();

router.get("/", requireRole("admin"), ctrl.listAudit);
router.get("/actors", requireRole("admin"), ctrl.listActors);

module.exports = router;
