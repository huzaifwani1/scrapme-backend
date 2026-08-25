const { validationResult } = require('express-validator');

/**
 * Middleware that checks express-validator results and returns 400 if invalid.
 * Use after validation chains in route definitions.
 */
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      messages: errors.array().map((e) => e.msg),
    });
  }
  next();
}

module.exports = validateRequest;
