const mongoose = require('mongoose');
const Influencer = require('../models/Influencer');
const Request = require('../models/Request');

const calculateCommission = async (requestId, finalPriceOverride) => {
  try {
    const request = await Request.findById(requestId);
    if (!request) {
      console.warn(`[Affiliate Helper] Request ${requestId} not found.`);
      return;
    }

    // Check if the order is completed
    if (request.status !== 'completed') {
      console.warn(`[Affiliate Helper] Request ${requestId} status is not completed. Current: ${request.status}`);
      return;
    }

    // Check if linked to an influencer and not already calculated
    if (!request.influencerId) return;
    if (request.commissionStatus) {
      console.log(`[Affiliate Helper] Commission already calculated for Request ${requestId}`);
      return;
    }

    const influencer = await Influencer.findById(request.influencerId);
    if (!influencer) {
      console.warn(`[Affiliate Helper] Linked influencer ${request.influencerId} not found.`);
      return;
    }

    // Determine Final Agreed Price
    const PickupOrder = require('../models/PickupOrder');
    const order = await PickupOrder.findOne({ requestId: request._id });

    // Prioritize finalPriceOverride, then order.finalPrice, fallback to request.priceNum
    const finalAgreedPrice = finalPriceOverride !== undefined 
      ? finalPriceOverride 
      : ((order && order.finalPrice !== undefined && order.finalPrice !== null) 
          ? order.finalPrice 
          : request.priceNum || 0);

    // Calculate commission using the dynamic database rules cache
    const { getCachedCommission } = require('./commissionCache');
    const commissionAmount = getCachedCommission(finalAgreedPrice);

    if (commissionAmount !== null && commissionAmount !== undefined) {
      // Rule matched
      request.commissionAmount = commissionAmount;
      request.commissionStatus = 'Pending';
      request.commissionCalculatedAt = new Date();
      await request.save();

      // Update Influencer totals
      influencer.totalCompleted += 1;
      influencer.totalRevenue += finalAgreedPrice;
      influencer.totalNetProfit += Math.round(finalAgreedPrice * 0.20);
      influencer.totalCommissionPending += commissionAmount;
      await influencer.save();

      console.log(`[Affiliate Helper] Successfully generated commission: ₹${commissionAmount} for Influencer "${influencer.name}" (Code: ${influencer.referralCode}) on Request ${requestId}`);
    } else {
      // No rule matched -> Manual Review!
      request.commissionAmount = 0;
      request.commissionStatus = 'ManualReview';
      request.commissionCalculatedAt = new Date();
      await request.save();

      // Update Influencer totals (but do NOT add pending commission since it's zero/unapproved)
      influencer.totalCompleted += 1;
      influencer.totalRevenue += finalAgreedPrice;
      influencer.totalNetProfit += Math.round(finalAgreedPrice * 0.20);
      await influencer.save();

      console.warn(`[Affiliate Helper] Commission rule missing for Final Price ₹${finalAgreedPrice}. Flagged Request ${requestId} for Manual Review.`);
    }
  } catch (err) {
    console.error('[Affiliate Helper] Error calculating commission:', err);
  }
};

module.exports = { calculateCommission };

