const express = require("express");
const ctrl = require("../controllers/publicPaymentController");

const router = express.Router();

// No auth — public tenant payment page
router.get("/properties", ctrl.listPublicProperties);
router.post("/mpesa/stk", ctrl.initiateStk);
router.post("/mpesa/callback", ctrl.mpesaCallback);
router.get("/mpesa/status/:paymentId", ctrl.paymentStatus);

module.exports = router;
