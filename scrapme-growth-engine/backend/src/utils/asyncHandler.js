/**
 * Wraps an async route handler so that rejected promises are forwarded to
 * the centralized error handler instead of crashing the process.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
