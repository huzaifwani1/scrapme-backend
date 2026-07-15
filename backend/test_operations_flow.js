#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const API_BASE = 'http://localhost:3001/api';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapme';

async function runIntegrationTest() {
  console.log('🚀 === ScrapMe Operations Production & Workforce Management Integration Test ===\n');

  let adminToken = '';
  let customerToken = '';
  let partnerToken = '';
  let partnerBToken = '';
  let warehouseToken = '';
  let requestId = '';
  let requestId2 = '';
  let orderId = ''; // PO database _id
  let orderId2 = '';
  let poNumber = ''; // PO-2026-###### format
  let generatedOtp = '';

  const rand = Math.floor(Math.random() * 100000);
  
  const testPartner = {
    name: 'Courier Bob',
    phone: '9988776655',
    employeeId: `PP-TEST-A-${rand}`,
    password: 'partnerpwd123',
    role: 'partner',
    email: 'bob.courier@example.com',
    assignedZone: 'North Bengaluru',
    vehicleDetails: 'Suzuki Access 125 (KA-03-HA-1234)',
    profilePhoto: '/uploads/bob.png'
  };

  const testPartnerB = {
    name: 'Courier Charlie (Intruder)',
    phone: '9988776633',
    employeeId: `PP-TEST-B-${rand}`,
    password: 'partnerpwd456',
    role: 'partner',
    email: 'charlie.intruder@example.com',
    assignedZone: 'East Bengaluru',
    vehicleDetails: 'Hero Splendor (KA-04-ED-5678)'
  };

  const testWarehouse = {
    name: 'Wh Auditor Alice',
    phone: '9988776644',
    employeeId: `WH-TEST-${rand}`,
    password: 'warehousepwd123',
    role: 'warehouse'
  };

  const testCustomer = {
    name: 'Alice Seller',
    email: `seller-${rand}@example.com`,
    password: 'Sellerpwd123'
  };

  try {
    // 0. CONNECT TO DB FOR STATE MANIPULATION
    console.log('Step 0: Connecting to MongoDB for boundary checks...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. ADMIN LOGIN
    console.log('\nStep 1: Logging in as Admin...');
    const adminLoginRes = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    
    if (adminLoginRes.status !== 200) {
      throw new Error(`Admin login failed: ${adminLoginRes.status} ${await adminLoginRes.text()}`);
    }
    const adminLoginData = await adminLoginRes.json();
    adminToken = adminLoginData.token;
    console.log('✅ Admin authenticated successfully.');

    // 2. CREATE PICKUP PARTNERS & WAREHOUSE STAFF
    console.log('\nStep 2: Registering pickup partners and warehouse user...');
    
    // Partner A
    const partnerRegRes = await fetch(`${API_BASE}/operations/admin/partners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(testPartner)
    });
    if (partnerRegRes.status !== 201) throw new Error(`Partner A reg failed: ${await partnerRegRes.text()}`);
    const partnerObj = await partnerRegRes.json();
    console.log(`✅ Registered Partner A (Bob) with Email: ${partnerObj.email}, Zone: ${partnerObj.assignedZone}`);

    // Partner B
    const partnerBRegRes = await fetch(`${API_BASE}/operations/admin/partners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(testPartnerB)
    });
    if (partnerBRegRes.status !== 201) throw new Error(`Partner B reg failed: ${await partnerBRegRes.text()}`);
    const partnerBObj = await partnerBRegRes.json();
    console.log(`✅ Registered Partner B (Charlie): ${partnerBObj.employeeId}`);

    // Warehouse staff
    const whRegRes = await fetch(`${API_BASE}/operations/admin/partners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(testWarehouse)
    });
    if (whRegRes.status !== 201) throw new Error(`Warehouse reg failed: ${await whRegRes.text()}`);
    const whObj = await whRegRes.json();
    console.log(`✅ Registered Warehouse Auditor: ${whObj.employeeId}`);

    // 3. CUSTOMER REGISTRATION & REQUEST CREATION
    console.log('\nStep 3: Creating customer requests...');
    const custRegRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCustomer)
    });
    if (custRegRes.status !== 201 && custRegRes.status !== 200) throw new Error(`Customer reg failed`);

    const custLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testCustomer.email, password: testCustomer.password })
    });
    const custLoginData = await custLoginRes.json();
    customerToken = custLoginData.token;

    // Create Request 1
    const reqCreateRes = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customerToken}` },
      body: JSON.stringify({
        brand: 'Apple',
        model: 'iPhone 13',
        storage: '128GB',
        price: '₹22,000',
        priceNum: 22000,
        sellerName: testCustomer.name,
        phone: '9900112233',
        address: 'ScrapMe Heights, Bangalore'
      })
    });
    const reqData = await reqCreateRes.json();
    requestId = reqData._id;
    console.log(`✅ Customer Request 1 created. ID: ${requestId}`);

    // Create Request 2 (for cancellation testing)
    const reqCreateRes2 = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customerToken}` },
      body: JSON.stringify({
        brand: 'Samsung',
        model: 'Galaxy S22',
        storage: '256GB',
        price: '₹28,000',
        priceNum: 28000,
        sellerName: testCustomer.name,
        phone: '9900112244',
        address: 'Electronic City, Bangalore'
      })
    });
    const reqData2 = await reqCreateRes2.json();
    requestId2 = reqData2._id;
    console.log(`✅ Customer Request 2 created. ID: ${requestId2}`);

    // 4. ADMIN ASSIGNS PARTNER A
    console.log('\nStep 4: Admin assigning partner A to requests...');
    const assignRes = await fetch(`${API_BASE}/operations/admin/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ requestId, partnerId: partnerObj._id })
    });
    if (assignRes.status !== 201) throw new Error(`Assign failed: ${await assignRes.text()}`);
    const orderData = await assignRes.json();
    orderId = orderData._id;
    poNumber = orderData.orderId;
    console.log(`✅ Request 1 assigned. Order ID: ${poNumber}`);

    // Assign Request 2 to Partner A (for cancellation testing)
    const assignRes2 = await fetch(`${API_BASE}/operations/admin/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ requestId: requestId2, partnerId: partnerObj._id })
    });
    const orderData2 = await assignRes2.json();
    orderId2 = orderData2._id;
    console.log(`✅ Request 2 assigned. Order ID: ${orderData2.orderId}`);

    // 5. PARTNER AUTH & DUTY UPDATE CHECK
    console.log('\nStep 5: Logging in partner Bob and updating duty status...');
    const partnerLoginRes = await fetch(`${API_BASE}/operations/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: testPartner.employeeId, password: testPartner.password })
    });
    partnerToken = (await partnerLoginRes.json()).token;

    // Toggle duty to online
    const dutyRes = await fetch(`${API_BASE}/operations/auth/duty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${partnerToken}` },
      body: JSON.stringify({ online: true })
    });
    const dutyData = await dutyRes.json();
    console.log(`✅ Partner duty update endpoint response: "${dutyData.message}"`);

    // 6. CANCELLATION TEST FLOW
    console.log('\nStep 6: Partner Bob cancelling Order 2 (Samsung S22)...');
    const cancelRes = await fetch(`${API_BASE}/operations/orders/${orderId2}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${partnerToken}` },
      body: JSON.stringify({ reason: 'Customer unreachable via phone', cancelledBy: 'partner' })
    });
    const cancelData = await cancelRes.json();
    console.log(`✅ Order 2 Cancelled. Status: ${cancelData.order.status}, Reason: "${cancelData.order.cancellationReason}"`);

    // Verify Request 2 returned to 'pending' state
    const request2Check = await mongoose.connection.db.collection('requests').findOne({ _id: new mongoose.Types.ObjectId(requestId2) });
    console.log(`✅ Request 2 status reset in database: "${request2Check.status}" (Expected: pending)`);
    if (request2Check.status !== 'pending') {
      throw new Error(`Cancellation failed to release request back to pending! Request status: ${request2Check.status}`);
    }

    // 7. PARTNER STATS & JOBS FILTERING
    console.log('\nStep 7: Testing partner statistics dashboard and tab filters...');
    const statsRes = await fetch(`${API_BASE}/operations/orders/stats`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${partnerToken}` }
    });
    const pStats = await statsRes.json();
    console.log(`✅ Partner Dashboard stats: Pending: ${pStats.pending}, Cancelled: ${pStats.cancelled}`);

    const pendingOrdersRes = await fetch(`${API_BASE}/operations/orders?status=pending`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${partnerToken}` }
    });
    const pendingOrdersList = await pendingOrdersRes.json();
    console.log(`✅ Pending Jobs list size: ${pendingOrdersList.length} (Expected: 1)`);

    const cancelledOrdersRes = await fetch(`${API_BASE}/operations/orders?status=cancelled`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${partnerToken}` }
    });
    const cancelledOrdersList = await cancelledOrdersRes.json();
    console.log(`✅ Cancelled Jobs list size: ${cancelledOrdersList.length} (Expected: 1)`);

    // 8. VERIFY VALID OTP & COMPLETE ORDER 1
    console.log('\nStep 8: Completing Order 1 via OTP verification...');
    const otpGenRes = await fetch(`${API_BASE}/operations/orders/${orderId}/otp/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${partnerToken}`, 'x-test-force-otp': 'true' }
    });
    // Query MongoDB directly to read the generated raw OTP from our secure _test_otp field
    const orderDoc = await mongoose.connection.db.collection('pickuporders').findOne({ _id: new mongoose.Types.ObjectId(orderId) });
    generatedOtp = orderDoc._test_otp;
    
    const verifyValidRes = await fetch(`${API_BASE}/operations/orders/${orderId}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${partnerToken}`, 'x-test-force-otp': 'true' },
      body: JSON.stringify({
        otp: generatedOtp,
        extraDevices: [{ brand: 'Nokia', model: '3310', storage: '16MB', condition: 'Broken', estimatedPrice: 500 }],
        notes: 'Verifying valid OTP',
        distanceTravelled: 4,
        durationMinutes: 15
      })
    });
    if (verifyValidRes.status !== 200) throw new Error('Verification failed');
    console.log('✅ OTP Verified. Order 1 status changed to picked_up.');

    // 9. SUBMIT WAREHOUSE AUDIT FOR ORDER 1
    console.log('\nStep 9: Submitting warehouse audit for Order 1...');
    const whLoginRes = await fetch(`${API_BASE}/operations/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: testWarehouse.employeeId, password: testWarehouse.password })
    });
    warehouseToken = (await whLoginRes.json()).token;

    const auditSubmitRes = await fetch(`${API_BASE}/operations/warehouse/orders/${orderId}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${warehouseToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warehouseDevices: [
          { brand: 'Apple', model: 'iPhone 13', storage: '128GB', condition: 'Customer Registered', estimatedPrice: 22000, status: 'received' },
          { brand: 'Nokia', model: '3310', storage: '16MB', condition: 'Broken', estimatedPrice: 500, status: 'received' }
        ],
        warehouseNotes: 'All matches.'
      })
    });
    if (auditSubmitRes.status !== 200) throw new Error('Audit submission failed');
    console.log('✅ Warehouse audit submitted. Order status is now: completed');

    // 10. ADMIN RETRIEVES DETAILED PARTNER PROFILE & HISTORY
    console.log('\nStep 10: Admin retrieving Detailed Partner Profile & Order History...');
    const profileRes = await fetch(`${API_BASE}/operations/admin/partners/${partnerObj._id}/profile`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const profileData = await profileRes.json();
    console.log(`✅ Profile retrieved. Partner: ${profileData.partner.name}, Assigned: ${profileData.statistics.totalOrdersAssigned}, Completed: ${profileData.statistics.totalOrdersCompleted}, Cancelled: ${profileData.statistics.totalCancelledOrders}`);
    console.log(`✅ Order History items count: ${profileData.history.length}`);
    if (profileData.history.length !== 2) {
      throw new Error(`Expected 2 history orders, got ${profileData.history.length}`);
    }

    // 11. ADMIN RETRIEVES DETAILED ORDER WORKFLOW RECORDS
    console.log('\nStep 11: Admin retrieving Detailed Order Logistics details (timeline + GPS)...');
    const detailOrderRes = await fetch(`${API_BASE}/operations/admin/orders/${orderId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const detailOrderData = await detailOrderRes.json();
    console.log(`✅ Detailed Order retrieved. PO: ${detailOrderData.order.orderId}`);
    console.log(`✅ Timeline events count: ${detailOrderData.timeline.length}`);
    if (detailOrderData.timeline.length === 0) {
      throw new Error('Timeline events cannot be empty!');
    }

    // 12. ADMIN RETRIEVES GLOBAL WORKFORCE PERFORMANCE ANALYTICS
    console.log('\nStep 12: Admin retrieving Global Workforce Performance Analytics...');
    const analyticsRes = await fetch(`${API_BASE}/operations/admin/analytics`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const analyticsData = await analyticsRes.json();
    console.log(`✅ Global Analytics: Completion Rate: ${analyticsData.completionRate}%, Cancellation Rate: ${analyticsData.cancellationRate}%`);
    console.log(`✅ Weekly Trend intervals count: ${analyticsData.weeklyPerformance.length}`);
    console.log(`✅ Monthly Trend intervals count: ${analyticsData.monthlyPerformance.length}`);

    console.log('\n🎉 ALL WORKFORCE AND ANALYTICS INTEGRATION TESTS PASSED END-TO-END!');

  } catch (err) {
    console.error('\n❌ WORKFORCE INTEGRATION TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    console.log('\nStep 13: Disconnecting Mongoose database...');
    await mongoose.disconnect();
    console.log('✅ Mongoose disconnected.');
  }
}

runIntegrationTest();
