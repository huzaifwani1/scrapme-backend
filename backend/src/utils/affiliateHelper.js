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

    // Determine total revenue generated from this order.
    // If a partner completed a pickup, they might have recorded a final price and extra devices.
    const PickupOrder = require('../models/PickupOrder');
    const order = await PickupOrder.findOne({ requestId: request._id });

    let revenue = finalPriceOverride || (order && order.finalPrice) || request.priceNum || 0;

    // Add extra devices prices to revenue
    if (order && order.extraDevices && order.extraDevices.length > 0) {
      order.extraDevices.forEach(d => {
        if (d.estimatedPrice) {
          revenue += d.estimatedPrice;
        }
      });
    }

    // Calculate Net Profit: default 20% of revenue
    const netProfit = Math.round(revenue * 0.20);

    // Calculate commission amount (percent of profit)
    const commissionPercent = influencer.commissionPercent || 10;
    const commissionAmount = Math.round((commissionPercent / 100) * netProfit);

    // Store in Request
    request.commissionAmount = commissionAmount;
    request.commissionStatus = 'Pending';
    await request.save();

    // Update Influencer totals
    influencer.totalCompleted += 1;
    influencer.totalRevenue += revenue;
    influencer.totalNetProfit += netProfit;
    influencer.totalCommissionPending += commissionAmount;
    await influencer.save();

    console.log(`[Affiliate Helper] Successfully generated commission: ₹${commissionAmount} for Influencer "${influencer.name}" (Code: ${influencer.referralCode}) on Request ${requestId}`);
  } catch (err) {
    console.error('[Affiliate Helper] Error calculating commission:', err);
  }
};

module.exports = { calculateCommission };
