const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const controller = require('../controllers/customerController');

// GET /api/customers
router.get('/', controller.listCustomers);

// GET /api/customers/:id
router.get('/:id', controller.getCustomer);

// POST /api/customers
router.post(
  '/',
  [
    body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
    body('email').optional().isEmail().withMessage('Invalid email address'),
    body('name').optional().trim().isLength({ min: 1 }).withMessage('Name cannot be empty'),
  ],
  validateRequest,
  controller.createCustomer
);

module.exports = router;
