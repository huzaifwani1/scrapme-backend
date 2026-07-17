const mongoose = require('mongoose');
const Influencer = require('../models/Influencer');
const Request = require('../models/Request');

// Fixed payout lookup table
const getCommissionAmount = (finalPrice) => {
  const table = {
    300: 30,
    500: 50,
    700: 70,
    1200: 120,
    1500: 150
  };
  if (finalPrice in table) {
    return table[finalPrice];
  }
  // Fallback: 10% of final price
  return Math.round(finalPrice * 0.10);
};

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

    // Calculate commission using the fixed payout table
    const commissionAmount = getCommissionAmount(finalAgreedPrice);
    
    // Revenue is the final agreed price
    const revenue = finalAgreedPrice;
    
    // Net profit estimate is 20% of revenue for general metrics display
    const netProfit = Math.round(revenue * 0.20);

    // Store in Request
    request.commissionAmount = commissionAmount;
    request.commissionStatus = 'Pending';
    request.commissionCalculatedAt = new Date();
    await request.save();

    // Update Influencer totals
    influencer.totalCompleted += 1;
    influencer.totalRevenue += revenue;
    influencer.totalNetProfit += netProfit;
    influencer.totalCommissionPending += commissionAmount;
    await influencer.save();

    console.log(`[Affiliate Helper] Successfully generated fixed commission: ₹${commissionAmount} (10% of Final Price ₹${finalAgreedPrice}) for Influencer "${influencer.name}" (Code: ${influencer.referralCode}) on Request ${requestId}`);
  } catch (err) {
    console.error('[Affiliate Helper] Error calculating commission:', err);
  }
};

module.exports = { calculateCommission };

