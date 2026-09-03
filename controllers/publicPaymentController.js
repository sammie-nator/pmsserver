const Property = require("../models/Property");
const RentPayment = require("../models/RentPayment");
const asyncHandler = require("../utils/asyncHandler");
const { stkPush, isConfigured, normalizePhone } = require("../utils/mpesa");

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

  // Anti double-pay: pending STK same unit + phone within 15 minutes
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
    return res.status(err.status || 502).json({
      error: err.message || "STK push failed",
      details: err.details || undefined,
    });
  }
});

const mpesaCallback = asyncHandler(async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) return;

    const checkoutRequestId = body.CheckoutRequestID;
    const resultCode = String(body.ResultCode);
    const resultDesc = body.ResultDesc || "";

    const payment = await RentPayment.findOne({ checkoutRequestId });
    if (!payment) return;

    if (
      payment.status === "success" ||
      payment.status === "failed" ||
      payment.status === "cancelled"
    ) {
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
  } catch (err) {
    console.error("[mpesa callback]", err);
  }
});

const paymentStatus = asyncHandler(async (req, res) => {
  const payment = await RentPayment.findById(req.params.paymentId).select(
    "status amount phone mpesaReceipt resultDesc propertyName unitCode buildingName createdAt"
  );
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  res.json(payment);
});

module.exports = {
  listPublicProperties,
  initiateStk,
  mpesaCallback,
  paymentStatus,
};
