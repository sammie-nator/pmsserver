const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/staffController");

const router = express.Router();

// Temporary: proves this file is what Render is running
// Open: GET https://pmsserver.onrender.com/api/staff/version
router.get("/version", (req, res) => {
  res.json({ staffRoutes: 2, hasVerify: true });
});

router.get("/", ctrl.listStaff);
router.post("/verify", ctrl.verifyPin);
router.post("/", requireRole("admin"), ctrl.createStaff);
router.patch("/:id", requireRole("admin"), ctrl.updateStaff);
router.delete("/:id", requireRole("admin"), ctrl.deleteStaff);

module.exports = router;
