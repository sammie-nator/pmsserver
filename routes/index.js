const express = require("express");

const propertyRoutes = require("./propertyRoutes");
const tenantRoutes = require("./tenantRoutes");
const billingRoutes = require("./billingRoutes");
const maintenanceRoutes = require("./maintenanceRoutes");
const staffRoutes = require("./staffRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const auditRoutes = require("./auditRoutes");
const balanceRoutes = require("./balanceRoutes");
const fieldUpdateRoutes = require("./fieldUpdateRoutes");
const publicPaymentRoutes = require("./publicPaymentRoutes");

const router = express.Router();

router.get("/health", (req, res) => res.json({ ok: true, actor: req.actor }));

router.use("/public", publicPaymentRoutes);
router.use("/audit", auditRoutes);
router.use("/balances", balanceRoutes);
router.use("/field-updates", fieldUpdateRoutes);
router.use("/properties", propertyRoutes);
router.use("/tenants", tenantRoutes);
router.use("/billing", billingRoutes);
router.use("/maintenance", maintenanceRoutes);
router.use("/staff", staffRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;
