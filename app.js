require("dotenv").config();
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const { attachActor } = require("./middleware/actor");
const { attachAudit } = require("./middleware/audit");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const routes = require("./routes");

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin.replace(/\/$/, ""));
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) callback(null, true);
      else callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(attachActor);
app.use("/api", attachAudit);
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4100;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] PMS API listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[server] Failed to start:", err.message);
    process.exit(1);
  });
