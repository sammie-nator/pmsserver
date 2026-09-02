// Wraps an async route handler so thrown errors / rejected promises land in
// Express's error handler instead of crashing the process.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
