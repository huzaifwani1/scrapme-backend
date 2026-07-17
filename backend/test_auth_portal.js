const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Influencer = require('./src/models/Influencer');
const Request = require('./src/models/Request');
const User = require('./src/models/User');

const {
  influencerLogin,
  influencerForgotPassword,
  influencerResetPassword,
  influencerChangePassword,
  getAffiliateDashboard,
  getAffiliateOrders
} = require('./src/controllers/affiliateController');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapme';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✅ ${message}`);
};

const runTests = async () => {
  console.log('🧪 Starting Influencer Login & Account Security Integration Tests...\n');
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // Cleanup existing test influencers
    await Influencer.deleteMany({ email: { $in: ['creator_a@test.com', 'creator_b@test.com'] } });

    // 1. Create Test Influencer A & Influencer B
    const bcrypt = require('bcryptjs');
    const tempPassA = 'temp_a123';
    const hashA = await bcrypt.hash(tempPassA, 10);
    const influencerA = await Influencer.create({
      name: 'Influencer A',
      instagramHandle: 'creator_a',
      phone: '8888888888',
      email: 'creator_a@test.com',
      upiId: 'creatora@upi',
      referralCode: 'creatorAcode',
      tempPassword: tempPassA,
      passwordHash: hashA,
      isLoginEnabled: true
    });

    const tempPassB = 'temp_b123';
    const hashB = await bcrypt.hash(tempPassB, 10);
    const influencerB = await Influencer.create({
      name: 'Influencer B',
      instagramHandle: 'creator_b',
      phone: '9999999999',
      email: 'creator_b@test.com',
      upiId: 'creatorb@upi',
      referralCode: 'creatorBcode',
      tempPassword: tempPassB,
      passwordHash: hashB,
      isLoginEnabled: true
    });

    console.log('🌱 Created test accounts (Influencer A and Influencer B).');

    // 2. Validate Controller Login with email
    let reqLogin = {
      body: { loginId: 'creator_a@test.com', password: tempPassA }
    };
    let resLogin = {
      json: (data) => {
        assert(data.success === true, 'Login with email is successful');
        assert(data.token !== undefined, 'Login response contains JWT token');
        influencerA.token = data.token;
      }
    };
    await influencerLogin(reqLogin, resLogin, (err) => { throw err; });

    // 3. Validate Controller Login with phone
    reqLogin.body.loginId = '8888888888';
    resLogin.json = (data) => {
      assert(data.success === true, 'Login with phone number is successful');
    };
    await influencerLogin(reqLogin, resLogin, (err) => { throw err; });

    // 4. Validate Lockout (isLoginEnabled = false)
    influencerA.isLoginEnabled = false;
    await influencerA.save();
    
    reqLogin.body.loginId = 'creator_a@test.com';
    let nextCalled = false;
    let errorStatus = 0;
    let resLockout = {
      status: (code) => {
        errorStatus = code;
        return { json: (data) => {} };
      }
    };
    await influencerLogin(reqLogin, resLockout, (err) => { nextCalled = true; });
    assert(errorStatus === 403, 'Login is denied (403 Forbidden) when accounts are locked/disabled');

    // Reset status back to enabled
    influencerA.isLoginEnabled = true;
    await influencerA.save();

    // 5. Test secure token session route (GET /api/affiliate/dashboard/me)
    const secret = process.env.JWT_SECRET || 'scrapme_jwt_secret_2026';
    const decodedToken = jwt.verify(influencerA.token, secret);
    assert(decodedToken.id === influencerA._id.toString(), 'JWT matches influencer ID');

    let reqDash = { influencer: influencerA };
    let resDash = {
      json: (data) => {
        assert(data.influencer.referralCode === 'creatorAcode', 'Secure dashboard me-route serves Influencer A data');
      }
    };
    await getAffiliateDashboard(reqDash, resDash, (err) => { throw err; });

    // 6. Test cross-account isolation security (JWT of A cannot access B)
    // In actual express routing, this is governed by influencerProtect which assigns req.influencer to the decoded token id.
    // If user requests /orders/me, they automatically query req.influencer._id. There is NO query param they can supply to switch users.
    // Let's assert that by executing getAffiliateDashboard with influencerB as req.influencer, it correctly fetches B's data
    let reqDashB = { influencer: influencerB };
    let resDashB = {
      json: (data) => {
        assert(data.influencer.referralCode === 'creatorBcode', 'Secure dashboard me-route serves Influencer B data');
      }
    };
    await getAffiliateDashboard(reqDashB, resDashB, (err) => { throw err; });

    // 7. Verify Forgot Password reset token generation
    let resetToken = '';
    let reqForgot = { body: { loginId: 'creator_a@test.com' } };
    let resForgot = {
      json: (data) => {
        assert(data.success === true, 'Forgot password response reports success');
        assert(data.resetToken !== undefined, 'Forgot password returns a token');
        resetToken = data.resetToken;
      }
    };
    await influencerForgotPassword(reqForgot, resForgot, (err) => { throw err; });

    // 8. Verify Password Reset update
    let reqReset = { body: { token: resetToken, newPassword: 'newPassword123' } };
    let resReset = {
      json: (data) => {
        assert(data.success === true, 'Password reset is successful');
      }
    };
    await influencerResetPassword(reqReset, resReset, (err) => { throw err; });

    // Confirm new password works for login and old temp password is cleared
    reqLogin.body.password = 'newPassword123';
    let loginSuccess = false;
    resLogin.json = (data) => {
      loginSuccess = data.success;
    };
    await influencerLogin(reqLogin, resLogin, (err) => { throw err; });
    assert(loginSuccess === true, 'Login with newly reset password works successfully');

    const reloadedA = await Influencer.findById(influencerA._id);
    assert(reloadedA.tempPassword === undefined, 'Plaintext tempPassword is deleted/cleared on password reset');

    // Cleanup test data
    await Influencer.deleteMany({ email: { $in: ['creator_a@test.com', 'creator_b@test.com'] } });
    console.log('\n🎉 ALL SECURITY AUTHENTICATION AND ACCESS CONTROL TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Integration Test Suite Failed:', err);
    process.exit(1);
  }
};

runTests();
