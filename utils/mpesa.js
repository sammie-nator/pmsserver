function baseUrl() {
  if (process.env.MPESA_BASE_URL) {
    return String(process.env.MPESA_BASE_URL).trim().replace(/\/$/, "");
  }
  return process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function isConfigured() {
  return Boolean(
    (process.env.MPESA_CONSUMER_KEY || "").trim() &&
      (process.env.MPESA_CONSUMER_SECRET || "").trim() &&
      (process.env.MPESA_SHORTCODE || "").trim() &&
      (process.env.MPESA_PASSKEY || "").trim() &&
      (process.env.MPESA_CALLBACK_URL || "").trim()
  );
}

async function getAccessToken() {
  const key = (process.env.MPESA_CONSUMER_KEY || "").trim();
  const secret = (process.env.MPESA_CONSUMER_SECRET || "").trim();

  if (!key || !secret) {
    const err = new Error(
      "MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET is missing on the server"
    );
    err.status = 503;
    throw err;
  }

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const url = `${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error(
      `Daraja OAuth non-JSON response (${res.status}): ${text.slice(0, 200)}`
    );
    err.status = 502;
    throw err;
  }

  if (!data.access_token) {
    const msg =
      data.errorMessage ||
      data.error_description ||
      data.error ||
      JSON.stringify(data);
    const err = new Error(`Daraja OAuth failed: ${msg}`);
    err.status = 502;
    throw err;
  }

  return data.access_token;
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

async function stkPush({ amount, phone, accountReference, transactionDesc }) {
  if (!isConfigured()) {
    const err = new Error("M-Pesa is not configured on the server");
    err.status = 503;
    throw err;
  }

  const token = await getAccessToken();
  const shortcode = (process.env.MPESA_SHORTCODE || "").trim();
  const passkey = (process.env.MPESA_PASSKEY || "").trim();
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");
  const normalized = normalizePhone(phone);
  const amt = Math.round(Number(amount));
  if (!amt || amt < 1) {
    throw Object.assign(new Error("Amount must be at least 1"), { status: 400 });
  }

  const transactionType =
    process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline";

  const body = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: transactionType,
    Amount: amt,
    PartyA: normalized,
    PartyB: shortcode,
    PhoneNumber: normalized,
    CallBackURL: (process.env.MPESA_CALLBACK_URL || "").trim(),
    AccountReference: String(accountReference || "Rent").slice(0, 12),
    TransactionDesc: String(transactionDesc || "Rent payment").slice(0, 13),
  };

  console.log("[mpesa] STK request", {
    shortcode,
    transactionType,
    amount: amt,
    phone: normalized,
    callback: body.CallBackURL,
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

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error(
      `Daraja STK non-JSON response (${res.status}): ${text.slice(0, 200)}`
    );
    err.status = 502;
    throw err;
  }

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

module.exports = {
  isConfigured,
  getAccessToken,
  normalizePhone,
  stkPush,
  baseUrl,
};
