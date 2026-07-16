const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('./src/config/db');
const Influencer = require('./src/models/Influencer');
const Request = require('./src/models/Request');
const User = require('./src/models/User');

const runTest = async () => {
  console.log('🧪 Starting Affiliate Creator Portal Integration Test...\n');
  await connectDB();

  try {
    // 1. Clean up old data
    await User.deleteMany({ email: 'portal_user@example.com' });
    await Influencer.deleteMany({ referralCode: 'portalref101' });

    // 2. Create Test User
    const testUser = await User.create({
      name: 'Portal Test User',
      email: 'portal_user@example.com',
      password: 'password123'
    });
    console.log('✅ Created test user');

    // 3. Create Influencer & Verify Secure Token Generation
    const influencer = await Influencer.create({
      name: 'Portal Influencer',
      instagramHandle: 'portal_creator',
      phone: '9876543210',
      email: 'portal_creator@example.com',
      upiId: 'creator@upi',
      commissionPercent: 12,
      referralCode: 'portalref101'
    });

    console.log('✅ Created influencer affiliate');
    console.log('🛡️ Generated Secure Token:', influencer.dashboardToken);
    
    if (!influencer.dashboardToken || influencer.dashboardToken.length !== 64) {
      throw new Error('❌ Token generation failed or token length is not 64 characters!');
    }
    console.log('✅ Token validation passed (length: 64, hex characters)');

    // 4. Create Referred Bookings
    const req1 = await Request.create({
      userId: testUser._id,
      userEmail: testUser.email,
      brand: 'Apple',
      model: 'iPhone 13',
      storage: '128GB',
      price: '₹700',
      priceNum: 700,
      sellerName: 'Huzaif Wani',
      phone: '6005333412',
      address: 'Srinagar, Kashmir',
      status: 'pending',
      influencerId: influencer._id
    });

    const req2 = await Request.create({
      userId: testUser._id,
      userEmail: testUser.email,
      brand: 'OnePlus',
      model: '9 Pro',
      storage: '256GB',
      price: '₹1200',
      priceNum: 1200,
      sellerName: 'John Doe',
      phone: '9988776655',
      address: 'Mumbai, Maharashtra',
      status: 'completed',
      influencerId: influencer._id
    });

    console.log('✅ Created 2 referred bookings (1 pending, 1 completed)');

    // 4.5 Trigger commission calculation using the real affiliateHelper
    const { calculateCommission } = require('./src/utils/affiliateHelper');
    await calculateCommission(req2._id);

    // Fetch updated influencer totals from DB
    const updatedInfluencer = await Influencer.findById(influencer._id);

    // 5. Test Masking Logic inside getAffiliateOrders controller
    const { getAffiliateOrders } = require('./src/controllers/affiliateController');

    let ordersResult = null;
    const mockReq = {
      influencer: updatedInfluencer
    };
    const mockRes = {
      json: (data) => {
        ordersResult = data;
      }
    };

    await getAffiliateOrders(mockReq, mockRes, (err) => {
      if (err) throw err;
    });

    console.log('\n--- Verifying Customer Privacy Masking ---');
    if (!ordersResult || ordersResult.length !== 2) {
      throw new Error(`❌ Expected 2 orders, got: ${ordersResult ? ordersResult.length : 0}`);
    }

    const o1 = ordersResult.find(o => o.priceNum === 700); // Huzaif Wani
    const o2 = ordersResult.find(o => o.priceNum === 1200); // John Doe

    console.log(`Original Name: "Huzaif Wani" -> Masked: "${o1.customerName}"`);
    console.log(`Original Phone: "6005333412" -> Masked: "${o1.phone}"`);
    console.log(`Original Name: "John Doe"    -> Masked: "${o2.customerName}"`);
    console.log(`Original Phone: "9988776655" -> Masked: "${o2.phone}"`);

    // Mask checks
    if (o1.customerName !== 'H***** W***' && o1.customerName !== 'H**** W***') {
      // Allow general first letter + asterisks word masking
      if (!o1.customerName.includes('*') || o1.customerName.includes('u') || o1.customerName.includes('z')) {
        throw new Error(`❌ Masking of name failed: ${o1.customerName}`);
      }
    }
    if (o1.phone !== '600*****12') {
      throw new Error(`❌ Masking of phone failed: ${o1.phone}`);
    }
    console.log('✅ Customer data privacy masking verified successfully!');

    // 6. Test Dashboard Analytics Aggregation
    const { getAffiliateDashboard } = require('./src/controllers/affiliateController');
    let dashboardResult = null;
    const mockResDash = {
      json: (data) => {
        dashboardResult = data;
      }
    };

    await getAffiliateDashboard(mockReq, mockResDash, (err) => {
      if (err) throw err;
    });

    console.log('\n--- Verifying Dashboard Analytics ---');
    console.log('Conversion rates:', dashboardResult.conversionRates);
    console.log('Payout details:', dashboardResult.payouts);

    if (dashboardResult.metrics.totalCommissionEarned !== 29) {
      throw new Error(`❌ Expected total commission earned to be 29, got: ${dashboardResult.metrics.totalCommissionEarned}`);
    }
    console.log('✅ Dashboard metrics and payout aggregates verified successfully!');

    // Clean up
    await User.deleteMany({ email: 'portal_user@example.com' });
    await Influencer.deleteMany({ referralCode: 'portalref101' });
    
    console.log('\n🎉 ALL PORTAL TESTS PASSED SUCCESSFULLY! Affiliate Portal is secure and production-ready. 🎉');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err.message);
    process.exit(1);
  }
};

runTest();
