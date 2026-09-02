function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: messages.join(" ") });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: `Invalid id: ${err.value}` });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: "That record already exists." });
  }

  res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
}

module.exports = { notFound, errorHandler };
