/**
 * Daraja STK — aligned with working samolvic pattern:
 *   BusinessShortCode = SHORTCODE (store/HO)
 *   PartyB            = TILL_NUMBER (Buy Goods till)
 *   TransactionType   = CustomerBuyGoodsOnline
 *
 * Env (either prefix works):
 *   MPESA_ / DARAJA_  CONSUMER_KEY, CONSUMER_SECRET, PASSKEY
 *   MPESA_SHORTCODE or DARAJA_SHORTCODE
 *   MPESA_TILL_NUMBER or DARAJA_TILL_NUMBER
 *   MPESA_CALLBACK_URL or DARAJA_CALLBACK_URL
 *   MPESA_BASE_URL or DARAJA_BASE_URL (default production API)
 *   MPESA_ENV = sandbox | production (if BASE_URL not set)
 */

function env(...keys) {
  for (const k of keys) {
    const v = (process.env[k] || "").trim();
    if (v) return v;
  }
  return "";
}

function baseUrl() {
  const explicit = env("MPESA_BASE_URL", "DARAJA_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  return env("MPESA_ENV", "DARAJA_ENV") === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";
}

function shortcode() {
  return env("MPESA_SHORTCODE", "DARAJA_SHORTCODE");
}

function tillNumber() {
  // Fall back to shortcode only if till not set
  return env("MPESA_TILL_NUMBER", "DARAJA_TILL_NUMBER") || shortcode();
}

function passkey() {
  return env("MPESA_PASSKEY", "DARAJA_PASSKEY");
}

function callbackUrl() {
  return env("MPESA_CALLBACK_URL", "DARAJA_CALLBACK_URL");
}

function consumerKey() {
  return env("MPESA_CONSUMER_KEY", "DARAJA_CONSUMER_KEY");
}

function consumerSecret() {
  return env("MPESA_CONSUMER_SECRET", "DARAJA_CONSUMER_SECRET");
}

function transactionType() {
  return (
    env("MPESA_TRANSACTION_TYPE", "DARAJA_TRANSACTION_TYPE") ||
    "CustomerBuyGoodsOnline"
  );
}

function isConfigured() {
  return Boolean(
    consumerKey() &&
      consumerSecret() &&
      shortcode() &&
      passkey() &&
      callbackUrl()
  );
}

// Token cache (samolvic pattern — avoid spike arrest)
let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const key = consumerKey();
  const secret = consumerSecret();
  if (!key || !secret) {
    const err = new Error("Daraja consumer key/secret missing");
    err.status = 503;
    throw err;
  }

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const url = `${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));

  if (!data.access_token) {
    const msg =
      data.errorMessage || data.error_description || data.error || JSON.stringify(data);
    const err = new Error(`Daraja OAuth failed: ${msg}`);
    err.status = 502;
    throw err;
  }

  const expiresInSec = Number(data.expires_in) || 3600;
  tokenCache = {
    token: data.access_token,
    expiresAt: now + (expiresInSec - 60) * 1000,
  };
  console.log("[mpesa] access token obtained (cached)");
  return tokenCache.token;
}

function buildPassword() {
  const ts = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const password = Buffer.from(`${shortcode()}${passkey()}${ts}`).toString("base64");
  return { timestamp: ts, password };
}

function normalizePhone(phone) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if ((p.startsWith("7") || p.startsWith("1")) && p.length === 9) p = "254" + p;
  if (!/^2547\d{8}$/.test(p) && !/^2541\d{8}$/.test(p)) {
    throw new Error("Enter a valid Kenyan mobile number (e.g. 07XXXXXXXX)");
  }
  return p;
}

async function stkPush({ amount, phone, accountReference, transactionDesc }) {
  if (!isConfigured()) {
    const err = new Error("M-Pesa is not configured on the server");
    err.status = 503;
    throw err;
  }

  const token = await getAccessToken();
  const { timestamp, password } = buildPassword();
  const normalized = normalizePhone(phone);
  const amt = Math.round(Number(amount));
  if (!amt || amt < 1) {
    throw Object.assign(new Error("Amount must be at least 1"), { status: 400 });
  }

  const sc = shortcode();
  const till = tillNumber();
  const type = transactionType();

  // Same shape as working samolvic:
  // BusinessShortCode = shortcode, PartyB = till
  const body = {
    BusinessShortCode: sc,
    Password: password,
    Timestamp: timestamp,
    TransactionType: type,
    Amount: amt,
    PartyA: normalized,
    PartyB: till,
    PhoneNumber: normalized,
    CallBackURL: callbackUrl(),
    AccountReference: String(accountReference || "Rent").slice(0, 12),
    TransactionDesc: String(transactionDesc || "Rent").slice(0, 13),
  };

  console.log("[mpesa] STK request", {
    BusinessShortCode: sc,
    PartyB: till,
    TransactionType: type,
    amount: amt,
    phone: normalized,
  });

  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  console.log("[mpesa] STK response", data);

  if (data.ResponseCode !== "0" && data.ResponseCode !== 0) {
    const err = new Error(
      data.errorMessage || data.ResponseDescription || data.error || "STK push failed"
    );
    err.status = 502;
    err.details = data;
    throw err;
  }

  return data;
}

/** Optional: query STK result if callback is slow (samolvic pattern) */
async function queryStkStatus(checkoutRequestId) {
  const token = await getAccessToken();
  const { timestamp, password } = buildPassword();

  const res = await fetch(`${baseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode(),
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  return res.json().catch(() => ({}));
}

module.exports = {
  isConfigured,
  getAccessToken,
  normalizePhone,
  stkPush,
  queryStkStatus,
  baseUrl,
  shortcode,
  tillNumber,
};
