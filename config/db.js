const mongoose = require("mongoose");

// Serverless functions can reuse a "warm" process between invocations, so
// we cache the connection promise on the module scope. Without this,
// every request on Vercel would open a brand new MongoDB connection and
// you'd blow through Atlas's connection limit within minutes.
let cachedConnection = null;

async function connectDB() {
  if (cachedConnection) return cachedConnection;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    // Never call process.exit() here - on Vercel that kills the whole
    // serverless function runtime, not just "this request". Throwing lets
    // the route return a proper 500 instead of the function crash-looping.
    throw new Error("MONGO_URI is not set. Add it in your environment variables.");
  }

  cachedConnection = mongoose
    .connect(uri, { maxPoolSize: 5 }) // serverless: keep the pool small, many function instances may run concurrently
    .then(async (conn) => {
      console.log("MongoDB connected");
      await dropStaleIndexes();
      return conn;
    })
    .catch((err) => {
      cachedConnection = null; // let the next request retry instead of caching a failure forever
      console.error("MongoDB connection failed:", err.message);
      throw err;
    });

  return cachedConnection;
}

// Old schema versions had unique fields (propertyCode, tenantCode, ...)
// that were later removed from the models. MongoDB doesn't drop indexes
// just because a field left the schema, so every subsequent insert has
// that field as undefined -> null, and the second one always throws
// E11000 on the leftover unique index. This checks every registered
// model's actual collection against its current schema and drops any
// index built on a field that no longer exists there. Safe to run on
// every cold start - it's a no-op once the stale indexes are gone.
async function dropStaleIndexes() {
  for (const modelName of mongoose.modelNames()) {
    const model = mongoose.model(modelName);
    const schemaPaths = new Set(Object.keys(model.schema.paths));

    try {
      const collection = mongoose.connection.db.collection(model.collection.name);
      const indexes = await collection.indexes();

      for (const index of indexes) {
        if (index.name === "_id_") continue; // never touch the default id index
        if (index.textIndexVersion || index["2dsphereIndexVersion"]) continue; // special indexes don't map 1:1 to schema paths

        const keys = Object.keys(index.key);
        const isStale = keys.some((k) => k !== "_id" && !schemaPaths.has(k));
        if (!isStale) continue;

        await collection.dropIndex(index.name);
        console.log(`Dropped stale index ${index.name} on ${model.collection.name} (field no longer in schema)`);
      }
    } catch (err) {
      if (err.codeName !== "NamespaceNotFound") {
        console.warn(`Could not check/drop stale indexes on ${modelName}:`, err.message);
      }
    }
  }
}

module.exports = connectDB;
