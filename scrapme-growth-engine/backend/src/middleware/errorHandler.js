/**
 * Centralized error-handling middleware.
 * Must be registered AFTER all routes.
 */
function errorHandler(err, req, res, _next) {
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      messages,
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: 'Duplicate Entry',
      message: `A record with this ${field} already exists.`,
    });
  }

  // Mongoose cast error (bad ObjectId, etc.)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID',
      message: `Invalid value for ${err.path}: ${err.value}`,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Authentication Error',
      message: err.message,
    });
  }

  // Default 500
  const safeMessage = String(err.message || 'Unknown error')
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[redacted-mongodb-uri]')
    .replace(/(token|password|secret)=?[^\s,]*/gi, '$1=[redacted]')
    .slice(0, 500);
  console.error('[Growth Engine] Unhandled error', {
    name: err.name || 'Error', code: err.code || null, message: safeMessage,
    method: req.method, path: req.path,
  });
  return res.status(err.statusCode || 500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
  });
}

module.exports = errorHandler;
