const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/staffController");

const router = express.Router();

router.get("/", ctrl.listStaff);
router.post("/verify", ctrl.verifyPin); // ← this line must exist
router.post("/", requireRole("admin"), ctrl.createStaff);
router.patch("/:id", requireRole("admin"), ctrl.updateStaff);
router.delete("/:id", requireRole("admin"), ctrl.deleteStaff);

module.exports = router;
