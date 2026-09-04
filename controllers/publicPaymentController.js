const Property = require("../models/Property");
const RentPayment = require("../models/RentPayment");
const asyncHandler = require("../utils/asyncHandler");
const {
  stkPush,
  isConfigured,
  normalizePhone,
  queryStkStatus,
} = require("../utils/mpesa");

// Throttle STK query per payment (samolvic pattern — avoids spike arrest)
const lastQueryAt = new Map();
const STK_QUERY_MIN_INTERVAL_MS = 12000;

/**
 * GET /api/public/properties
 */
const listPublicProperties = asyncHandler(async (req, res) => {
  const properties = await Property.find({ status: { $ne: "deactivated" } })
    .select(
      "name buildingName floorLabel floorNumber unitCode category area monthlyRent status description"
    )
    .sort({ buildingName: 1, floorNumber: 1, unitCode: 1, name: 1 })
    .lean();

  const buildings = [
    ...new Set(properties.map((p) => p.buildingName || p.name).filter(Boolean)),
  ].sort();

  res.json({ buildings, properties });
});

/**
 * POST /api/public/mpesa/stk
 * body: { propertyId, phone, amount? }
 */
const initiateStk = asyncHandler(async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: "M-Pesa is not configured on the server." });
  }

  const { propertyId, phone, amount } = req.body;
  if (!propertyId || !phone) {
    return res.status(400).json({ error: "propertyId and phone are required." });
  }

  const property = await Property.findById(propertyId);
  if (!property || property.status === "deactivated") {
    return res.status(404).json({ error: "Unit not found." });
  }

  let payAmount =
    amount != null && amount !== "" ? Number(amount) : property.monthlyRent;
  payAmount = Math.round(payAmount);
  if (!payAmount || payAmount < 1) {
    return res.status(400).json({ error: "Invalid amount." });
  }

  let normalized;
  try {
    normalized = normalizePhone(phone);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // Anti double-pay: pending STK for same unit + phone within 15 minutes
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
  const existingPending = await RentPayment.findOne({
    property: propertyId,
    phone: normalized,
    status: "pending",
    createdAt: { $gte: fifteenMinAgo },
  });
  if (existingPending) {
    return res.status(409).json({
      error:
        "A payment prompt is already open for this number. Complete it on your phone or wait a few minutes.",
      paymentId: existingPending._id,
    });
  }

  const accountRef = (property.unitCode || property.name || "RENT")
    .replace(/\s+/g, "")
    .slice(0, 12);

  const payment = await RentPayment.create({
    property: property._id,
    propertyName: property.name,
    unitCode: property.unitCode || "",
    buildingName: property.buildingName || "",
    amount: payAmount,
    phone: normalized,
    status: "pending",
  });

  try {
    const stk = await stkPush({
      amount: payAmount,
      phone: normalized,
      accountReference: accountRef,
      transactionDesc: "Rent",
    });

    payment.merchantRequestId = stk.MerchantRequestID || "";
    payment.checkoutRequestId = stk.CheckoutRequestID || "";
    await payment.save();

    console.log("[mpesa] payment pending", {
      paymentId: payment._id.toString(),
      checkoutRequestId: payment.checkoutRequestId,
    });

    return res.status(201).json({
      message: "STK push sent. Check your phone and enter your M-Pesa PIN.",
      paymentId: payment._id,
      checkoutRequestId: payment.checkoutRequestId,
      amount: payAmount,
      phone: normalized,
      property: {
        name: property.name,
        unitCode: property.unitCode,
        buildingName: property.buildingName,
      },
    });
  } catch (err) {
    payment.status = "failed";
    payment.resultDesc = err.message;
    await payment.save();
    console.error("[mpesa] STK failed", err.message);
    return res.status(err.status || 502).json({
      error: err.message || "STK push failed",
      details: err.details || undefined,
    });
  }
});

/**
 * POST /api/public/mpesa/callback
 * Safaricom posts STK result here.
 */
const mpesaCallback = asyncHandler(async (req, res) => {
  // Always ACK first so Safaricom does not retry aggressively
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    console.log("[mpesa callback] body:", JSON.stringify(req.body));

    const body = req.body?.Body?.stkCallback;
    if (!body) {
      console.log("[mpesa callback] no stkCallback in body");
      return;
    }

    const checkoutRequestId = body.CheckoutRequestID;
    const resultCode = String(body.ResultCode);
    const resultDesc = body.ResultDesc || "";

    console.log("[mpesa callback] result", {
      checkoutRequestId,
      resultCode,
      resultDesc,
    });

    const payment = await RentPayment.findOne({ checkoutRequestId });
    if (!payment) {
      console.log("[mpesa callback] no payment for", checkoutRequestId);
      return;
    }

    // Idempotent
    if (
      payment.status === "success" ||
      payment.status === "failed" ||
      payment.status === "cancelled"
    ) {
      console.log("[mpesa callback] already final", payment.status);
      return;
    }

    payment.resultCode = resultCode;
    payment.resultDesc = resultDesc;

    if (resultCode === "0") {
      payment.status = "success";
      const items = body.CallbackMetadata?.Item || [];
      const receipt = items.find((i) => i.Name === "MpesaReceiptNumber");
      if (receipt) payment.mpesaReceipt = String(receipt.Value);
    } else {
      payment.status = resultCode === "1032" ? "cancelled" : "failed";
    }

    await payment.save();
    console.log("[mpesa callback] saved", {
      paymentId: payment._id.toString(),
      status: payment.status,
      receipt: payment.mpesaReceipt,
    });
  } catch (err) {
    console.error("[mpesa callback] error", err);
  }
});

/**
 * GET /api/public/mpesa/status/:paymentId
 * Poll from client. If still pending, optionally query Daraja (throttled).
 */
const paymentStatus = asyncHandler(async (req, res) => {
  const payment = await RentPayment.findById(req.params.paymentId);
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  if (payment.status === "pending" && payment.checkoutRequestId) {
    const id = payment._id.toString();
    const now = Date.now();
    const prev = lastQueryAt.get(id) || 0;

    if (now - prev >= STK_QUERY_MIN_INTERVAL_MS) {
      lastQueryAt.set(id, now);
      try {
        console.log("[mpesa] STK query", payment.checkoutRequestId);
        const q = await queryStkStatus(payment.checkoutRequestId);
        const resultCode = q.ResultCode != null ? String(q.ResultCode) : "";
        const resultDesc = q.ResultDesc || "";

        console.log("[mpesa] STK query result", { resultCode, resultDesc });

        // 0 = success; 4999 = often still processing
        if (resultCode === "0") {
          payment.status = "success";
          payment.resultCode = resultCode;
          payment.resultDesc = resultDesc;
          await payment.save();
        } else if (resultCode && resultCode !== "4999") {
          payment.status = resultCode === "1032" ? "cancelled" : "failed";
          payment.resultCode = resultCode;
          payment.resultDesc = resultDesc || payment.resultDesc;
          await payment.save();
        }
      } catch (err) {
        console.error("[mpesa] STK query failed", err.message);
      }
    }
  }

  res.json({
    status: payment.status,
    amount: payment.amount,
    phone: payment.phone,
    mpesaReceipt: payment.mpesaReceipt,
    resultDesc: payment.resultDesc,
    propertyName: payment.propertyName,
    unitCode: payment.unitCode,
    buildingName: payment.buildingName,
    createdAt: payment.createdAt,
  });
});

module.exports = {
  listPublicProperties,
  initiateStk,
  mpesaCallback,
  paymentStatus,
};
