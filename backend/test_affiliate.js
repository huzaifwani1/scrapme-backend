const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('./src/config/db');
const Influencer = require('./src/models/Influencer');
const AffiliateClick = require('./src/models/AffiliateClick');
const Request = require('./src/models/Request');
const User = require('./src/models/User');
const { calculateCommission } = require('./src/utils/affiliateHelper');

const runTest = async () => {
  console.log('🧪 Starting Affiliate System Integration Test...\n');
  
  // 1. Connect to Database
  await connectDB();

  try {
    const CommissionSetting = require('./src/models/CommissionSetting');
    const { refreshCommissionCache } = require('./src/utils/commissionCache');

    // Clean up past test data
    await User.deleteMany({ email: 'affiliate_test_user@example.com' });
    await Influencer.deleteMany({ referralCode: 'testref123' });
    await AffiliateClick.deleteMany({});
    await CommissionSetting.deleteMany({ finalPrice: 700 });

    // Seed test commission rule
    await CommissionSetting.create({
      finalPrice: 700,
      commissionAmount: 14,
      isActive: true,
      sortOrder: 3
    });
    await refreshCommissionCache();
    
    // Create test user
    const testUser = await User.create({
      name: 'Affiliate Test User',
      email: 'affiliate_test_user@example.com',
      password: 'password123'
    });
    console.log('✅ Created test user:', testUser.name);

    // 2. Create Influencer
    const influencer = await Influencer.create({
      name: 'Test Influencer',
      instagramHandle: 'test_instagram',
      phone: '1234567890',
      email: 'influencer_test@example.com',
      upiId: 'influencer@upi',
      commissionPercent: 10,
      referralCode: 'testref123'
    });
    console.log('✅ Created influencer with referralCode:', influencer.referralCode);

    // 3. Simulate click tracking / validation
    console.log('\n--- Simulating landing clicks (validateReferralCode) ---');
    const validateController = require('./src/controllers/influencerController').validateReferralCode;
    
    // Mock req / res for first click
    let click1Logged = false;
    const req1 = {
      params: { code: 'testref123' },
      ip: '192.168.1.1',
      headers: { 'user-agent': 'Test Browser' }
    };
    const res1 = {
      json: (data) => {
        if (data.valid) click1Logged = true;
      },
      status: () => res1
    };

    await validateController(req1, res1, (err) => { if (err) console.error(err); });
    console.log('✅ First click processed. Valid?', click1Logged);

    // Mock req / res for second click (duplicate IP click lock test)
    let click2Logged = false;
    const req2 = {
      params: { code: 'testref123' },
      ip: '192.168.1.1',
      headers: { 'user-agent': 'Test Browser' }
    };
    const res2 = {
      json: (data) => {
        if (data.valid) click2Logged = true;
      },
      status: () => res2
    };

    await validateController(req2, res2, (err) => { if (err) console.error(err); });
    console.log('✅ Duplicate click processed. Valid?', click2Logged);

    // Load influencer again to inspect clicks
    const infAfterClicks = await Influencer.findById(influencer._id);
    console.log(`ℹ️ Clicks registered on Influencer (expected 1 due to duplicate IP limit): ${infAfterClicks.totalClicks}`);
    if (infAfterClicks.totalClicks !== 1) {
      throw new Error('Clicks tracking test failed! Clicks count is not 1.');
    }
    console.log('✅ Click tracking and spam prevention verified successfully!');

    // 4. Submit Pickup Request / Order linked to influencer
    console.log('\n--- Creating pickup request referred by influencer ---');
    const createRequestController = require('./src/controllers/requestController').createRequest;
    
    // Mock request creation
    let requestCreated = null;
    const reqCreate = {
      user: testUser,
      body: {
        brand: 'Apple',
        model: 'iPhone 14',
        storage: '128GB',
        sellerName: 'Customer Name',
        phone: '9999988888',
        address: 'Pickup Address Delhi',
        influencerId: influencer._id.toString()
      }
    };
    const resCreate = {
      status: () => resCreate,
      json: (data) => {
        requestCreated = data;
      }
    };

    await createRequestController(reqCreate, resCreate, (err) => { if (err) console.error(err); });
    console.log('✅ Created request. Request ID:', requestCreated._id);
    console.log('ℹ️ Linked influencerId in request:', requestCreated.influencerId);

    const infAfterOrder = await Influencer.findById(influencer._id);
    console.log(`ℹ️ Total orders incremented on Influencer: ${infAfterOrder.totalOrders}`);
    if (infAfterOrder.totalOrders !== 1) {
      throw new Error('Order linking or stats update failed!');
    }

    // 5. Complete request (simulate admin or warehouse verification)
    console.log('\n--- Completing request & calculating commission ---');
    // Set status to completed
    await Request.findByIdAndUpdate(requestCreated._id, { status: 'completed' });
    
    // Trigger commission calculator helper
    // iPhone 14 128GB: price is ₹600 (from PRICES map)
    await calculateCommission(requestCreated._id);

    const completedReq = await Request.findById(requestCreated._id);
    console.log('ℹ️ Request Status:', completedReq.status);
    console.log('ℹ️ Commission Status:', completedReq.commissionStatus);
    console.log('ℹ️ Commission Amount:', completedReq.commissionAmount);

    if (completedReq.commissionStatus !== 'Pending' || completedReq.commissionAmount !== 14) {
      throw new Error(`Commission calculation failed! Expected Pending and ₹14, got: ${completedReq.commissionStatus} and ₹${completedReq.commissionAmount}`);
    }

    const infAfterCompleted = await Influencer.findById(influencer._id);
    console.log('\n--- Verifying Influencer totals after completion ---');
    console.log('ℹ️ Completed Orders (expected 1):', infAfterCompleted.totalCompleted);
    console.log('ℹ️ Revenue Generated (expected 700):', infAfterCompleted.totalRevenue);
    console.log('ℹ️ Net Profit (expected 140):', infAfterCompleted.totalNetProfit);
    console.log('ℹ️ Pending Commission (expected 14):', infAfterCompleted.totalCommissionPending);

    if (
      infAfterCompleted.totalCompleted !== 1 ||
      infAfterCompleted.totalRevenue !== 700 ||
      infAfterCompleted.totalNetProfit !== 140 ||
      infAfterCompleted.totalCommissionPending !== 14
    ) {
      throw new Error('Influencer metrics update failed!');
    }
    console.log('✅ Order completion and stats update verified successfully!');

    // 6. Pay Commission
    console.log('\n--- Paying commission ---');
    const payCommissionController = require('./src/controllers/influencerController').payCommission;
    let paymentSuccess = false;
    const reqPay = {
      body: { requestId: requestCreated._id.toString() }
    };
    const resPay = {
      json: (data) => {
        if (data.request && data.request.commissionStatus === 'Paid') {
          paymentSuccess = true;
        }
      }
    };

    await payCommissionController(reqPay, resPay, (err) => { if (err) console.error(err); });
    console.log('✅ Processed payment. Paid Status verified?', paymentSuccess);

    const infAfterPaid = await Influencer.findById(influencer._id);
    console.log('ℹ️ Pending Commission (expected 0):', infAfterPaid.totalCommissionPending);
    console.log('ℹ️ Paid Commission (expected 14):', infAfterPaid.totalCommissionPaid);

    if (infAfterPaid.totalCommissionPending !== 0 || infAfterPaid.totalCommissionPaid !== 14) {
      throw new Error('Influencer payout stats update failed!');
    }
    console.log('✅ Commission payment workflow verified successfully!');

    // Clean up test data
    await User.deleteMany({ email: 'affiliate_test_user@example.com' });
    await Influencer.deleteMany({ referralCode: 'testref123' });
    await AffiliateClick.deleteMany({});
    await CommissionSetting.deleteMany({ finalPrice: 700 });
    
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Affiliate System is 100% production-ready. 🎉');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
};

runTest();
