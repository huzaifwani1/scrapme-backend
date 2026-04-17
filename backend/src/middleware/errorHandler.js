const errorHandler = (err, req, res, next) => {
  // Default error structure
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Log error for debugging
  console.error(`[ERROR] ${req.method} ${req.originalUrl}`);
  console.error(`Message: ${error.message}`);
  console.error(`Stack: ${error.stack}`);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    error.message = `Validation failed: ${messages.join(', ')}`;
    error.statusCode = 400;
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error.message = `Duplicate value entered for ${field}. Please use another value.`;
    error.statusCode = 400;
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    error.message = `Resource not found with id of ${err.value}`;
    error.statusCode = 404;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token. Please log in again.';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired. Please log in again.';
    error.statusCode = 401;
  }

  // Express-validator errors
  if (err.array && typeof err.array === 'function') {
    const errors = err.array();
    error.message = 'Validation failed';
    error.errors = errors.map(e => ({
      field: e.param,
      message: e.msg,
      location: e.location
    }));
    error.statusCode = 400;
  }

  // Set default status code and message
  const statusCode = error.statusCode || err.statusCode || 500;
  const message = error.message || 'Internal server error';

  // Prepare response
  const response = {
    success: false,
    message: message,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  };

  // Add validation errors if present
  if (error.errors) {
    response.errors = error.errors;
  }

  // Send response
  res.status(statusCode).json(response);
};

// 404 Not Found middleware
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { errorHandler, notFound };
