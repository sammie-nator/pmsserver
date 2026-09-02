/**
 * Safaricom Daraja STK Push helpers.
 * Env:
 *   MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET
 *   MPESA_SHORTCODE (Paybill/Till)
 *   MPESA_PASSKEY
 *   MPESA_CALLBACK_URL  (public HTTPS URL to /api/public/mpesa/callback)
 *   MPESA_ENV = sandbox | production  (default sandbox)
 */

function baseUrl() {
  return process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function isConfigured() {
  return Boolean(
    process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_SHORTCODE &&
      process.env.MPESA_PASSKEY &&
      process.env.MPESA_CALLBACK_URL
  );
}

async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.errorMessage || data.error_description || "Could not get M-Pesa access token");
  }
  return data.access_token;
}

/** Normalize KE phone to 2547XXXXXXXX */
function normalizePhone(phone) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("7") && p.length === 9) p = "254" + p;
  if (p.startsWith("+")) p = p.slice(1);
  if (!/^2547\d{8}$/.test(p) && !/^2541\d{8}$/.test(p)) {
    throw new Error("Enter a valid Kenyan mobile number (e.g. 07XXXXXXXX)");
  }
  return p;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/**
 * Initiate STK Push.
 * @returns Daraja response (CheckoutRequestID, MerchantRequestID, ...)
 */
async function stkPush({ amount, phone, accountReference, transactionDesc }) {
  if (!isConfigured()) {
    const err = new Error("M-Pesa is not configured on the server");
    err.status = 503;
    throw err;
  }

  const token = await getAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");
  const normalized = normalizePhone(phone);
  const amt = Math.round(Number(amount));
  if (!amt || amt < 1) throw Object.assign(new Error("Amount must be at least 1"), { status: 400 });

  const body = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline",
    Amount: amt,
    PartyA: normalized,
    PartyB: shortcode,
    PhoneNumber: normalized,
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: String(accountReference || "Rent").slice(0, 12),
    TransactionDesc: String(transactionDesc || "Rent payment").slice(0, 13),
  };

  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.ResponseCode !== "0" && data.ResponseCode !== 0) {
    const err = new Error(data.errorMessage || data.ResponseDescription || "STK push failed");
    err.status = 502;
    err.details = data;
    throw err;
  }
  return data;
}

module.exports = { isConfigured, getAccessToken, normalizePhone, stkPush };
