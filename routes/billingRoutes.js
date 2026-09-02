const express = require("express");
const { requireRole } = require("../middleware/actor");
const ctrl = require("../controllers/billingController");

const router = express.Router();

// Billing is financial/tenant-linked data - agents don't get it either.
router.use(requireRole("admin", "frontdesk"));

router.get("/", ctrl.listBilling);
router.get("/:id", ctrl.getBilling);
router.post("/", ctrl.createBilling);
router.patch("/:id", ctrl.updateBilling);
router.delete("/:id", requireRole("admin"), ctrl.deleteBilling);
router.post("/:id/comments", ctrl.addComment);

module.exports = router;
