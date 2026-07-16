const express = require('express');
const router = express.Router();
const { adminProtect } = require('../middleware/adminAuth');
const {
  validateReferralCode,
  getInfluencers,
  createInfluencer,
  getInfluencerDetails,
  updateInfluencer,
  deleteInfluencer,
  toggleInfluencer,
  payCommission,
  getAllCommissions
} = require('../controllers/influencerController');

// Public route to validate code and register clicks
router.get('/validate/:code', validateReferralCode);

// Admin-protected routes
router.get('/commissions', adminProtect, getAllCommissions);
router.get('/', adminProtect, getInfluencers);
router.post('/', adminProtect, createInfluencer);
router.get('/:id', adminProtect, getInfluencerDetails);
router.put('/:id', adminProtect, updateInfluencer);
router.delete('/:id', adminProtect, deleteInfluencer);
router.post('/:id/toggle', adminProtect, toggleInfluencer);
router.post('/pay-commission', adminProtect, payCommission);

module.exports = router;
