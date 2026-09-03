const express = require("express");
const ctrl = require("../controllers/publicPaymentController");
const { isConfigured, getAccessToken, baseUrl } = require("../utils/mpesa");

const router = express.Router();

router.get("/properties", ctrl.listPublicProperties);
router.post("/mpesa/stk", ctrl.initiateStk);
router.post("/mpesa/callback", ctrl.mpesaCallback);
router.get("/mpesa/status/:paymentId", ctrl.paymentStatus);

// Temporary — remove after debugging
router.get("/mpesa/debug-auth", async (req, res) => {
  const key = (process.env.MPESA_CONSUMER_KEY || "").trim();
  const secret = (process.env.MPESA_CONSUMER_SECRET || "").trim();

  const info = {
    configured: isConfigured(),
    env: process.env.MPESA_ENV || "(not set)",
    baseUrl: baseUrl(),
    keyLength: key.length,
    secretLength: secret.length,
    shortcode: (process.env.MPESA_SHORTCODE || "").trim() || "(missing)",
    hasPasskey: Boolean((process.env.MPESA_PASSKEY || "").trim()),
    callback: process.env.MPESA_CALLBACK_URL || "(missing)",
    transactionType:
      process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline (default)",
  };

  try {
    const token = await getAccessToken();
    return res.json({
      ...info,
      ok: true,
      tokenPreview: token.slice(0, 8) + "…",
    });
  } catch (err) {
    return res.status(502).json({
      ...info,
      ok: false,
      error: err.message,
    });
  }
});

module.exports = router;
