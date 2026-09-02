const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/propertyController");

const router = express.Router();

router.get("/meta", ctrl.getMeta);
router.get("/", ctrl.listProperties);
router.get("/:id", ctrl.getProperty);

// Only admins create properties, per the brief.
router.post("/", requireRole("admin"), ctrl.createProperty);
router.post("/building", requireRole("admin"), ctrl.createBuildingWithFloors);
router.patch("/:id", requireRole("admin"), ctrl.updateProperty);
router.delete("/:id", requireRole("admin"), ctrl.deleteProperty);
router.post("/:id/comments", requireRole("admin"), ctrl.addComment);

module.exports = router;
