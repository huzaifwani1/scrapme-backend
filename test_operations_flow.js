#!/usr/bin/env node

// Use native global fetch

const API_BASE = 'http://localhost:3001/api';

async function runIntegrationTest() {
  console.log('🚀 === ScrapMe Operations System Integration Test ===\n');

  let adminToken = '';
  let customerToken = '';
  let partnerToken = '';
  let warehouseToken = '';
  let requestId = '';
  let orderId = ''; // PO database _id
  let poNumber = ''; // PO-2026-###### format
  let generatedOtp = '';

  const rand = Math.floor(Math.random() * 100000);
  const testPartner = {
    name: 'Courier Bob',
    phone: '9988776655',
    employeeId: `PP-TEST-${rand}`,
    password: 'partnerpwd123',
    role: 'partner'
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
    // 1. ADMIN LOGIN
    console.log('Step 1: Logging in as Admin...');
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

    // 2. CREATE PICKUP PARTNER & WAREHOUSE STAFF
    console.log('\nStep 2: Registering pickup partner and warehouse user via admin...');
    const partnerRegRes = await fetch(`${API_BASE}/operations/admin/partners`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(testPartner)
    });
    
    if (partnerRegRes.status !== 201) {
      throw new Error(`Partner registration failed: ${partnerRegRes.status} ${await partnerRegRes.text()}`);
    }
    const partnerObj = await partnerRegRes.json();
    console.log(`✅ Registered Pickup Partner: ${partnerObj.name} (${partnerObj.employeeId})`);

    const whRegRes = await fetch(`${API_BASE}/operations/admin/partners`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(testWarehouse)
    });
    
    if (whRegRes.status !== 201) {
      throw new Error(`Warehouse staff registration failed: ${whRegRes.status} ${await whRegRes.text()}`);
    }
    const whObj = await whRegRes.json();
    console.log(`✅ Registered Warehouse Auditor: ${whObj.name} (${whObj.employeeId})`);

    // 3. CUSTOMER REGISTRATION & REQUEST CREATION
    console.log('\nStep 3: Registering a test customer and creating a requests...');
    const custRegRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCustomer)
    });
    
    if (custRegRes.status !== 201 && custRegRes.status !== 200) {
      throw new Error(`Customer registration failed: ${custRegRes.status}`);
    }

    const custLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testCustomer.email, password: testCustomer.password })
    });
    const custLoginData = await custLoginRes.json();
    customerToken = custLoginData.token;

    // Create Request
    const reqCreateRes = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        brand: 'Apple',
        model: 'iPhone 13',
        storage: '128GB',
        price: '₹22,000',
        priceNum: 22000,
        sellerName: testCustomer.name,
        phone: '9900112233',
        address: 'Flat 101, ScrapMe Heights, Bangalore'
      })
    });
    const reqData = await reqCreateRes.json();
    requestId = reqData._id;
    console.log(`✅ Customer Request created. ID: ${requestId} (${reqData.brand} ${reqData.model})`);

    // 4. ADMIN ASSIGNS PARTNER (PickupOrder PO-2026-###### is created)
    console.log('\nStep 4: Admin assigning pickup partner to request...');
    const assignRes = await fetch(`${API_BASE}/operations/admin/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        requestId,
        partnerId: partnerObj._id
      })
    });

    if (assignRes.status !== 201) {
      throw new Error(`Assign partner failed: ${assignRes.status} ${await assignRes.text()}`);
    }
    const orderData = await assignRes.json();
    orderId = orderData._id;
    poNumber = orderData.orderId;
    console.log(`✅ Order assigned. Format check: "${poNumber}" (Expected: PO-2026-######)`);
    if (!poNumber.startsWith('PO-2026-')) {
      throw new Error('❌ Format verification failed. Format is not correct.');
    }

    // 5. PARTNER AUTHENTICATES & FETCHES JOB
    console.log('\nStep 5: Pickup partner authenticating and fetching active jobs...');
    const partnerLoginRes = await fetch(`${API_BASE}/operations/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: testPartner.employeeId, password: testPartner.password })
    });
    
    if (partnerLoginRes.status !== 200) {
      throw new Error(`Partner login failed: ${await partnerLoginRes.text()}`);
    }
    const partnerLoginData = await partnerLoginRes.json();
    partnerToken = partnerLoginData.token;

    // Get Jobs
    const jobsRes = await fetch(`${API_BASE}/operations/orders`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${partnerToken}` }
    });
    const jobs = await jobsRes.json();
    console.log(`✅ Active jobs count: ${jobs.length}. Assigned PO: ${jobs[0].orderId}`);
    if (jobs[0].orderId !== poNumber) {
      throw new Error('❌ Assigned job mismatch.');
    }

    // 6. UPDATE GPS SIMULATION
    console.log('\nStep 6: Partner duty starts, updating GPS telemetry...');
    const gpsRes = await fetch(`${API_BASE}/operations/gps/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${partnerToken}`
      },
      body: JSON.stringify({
        latitude: 12.97159,
        longitude: 77.59456,
        eta: '12 mins'
      })
    });
    if (gpsRes.status !== 200) {
      throw new Error(`GPS update failed: ${await gpsRes.text()}`);
    }
    console.log('✅ GPS telemetry synced successfully.');

    // 7. DIRECT PICKUP & VALIDATIONS
    console.log('\nStep 7: Verifying validation - Pickup fails without final price...');
    const failRes = await fetch(`${API_BASE}/operations/orders/${orderId}/pickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${partnerToken}`
      },
      body: JSON.stringify({
        notes: 'Customer handed over 2 additional devices. Fair condition.',
        distanceTravelled: 4.8,
        durationMinutes: 24
      })
    });
    console.log(`✅ Fails without price. Status code: ${failRes.status} (Expected: 400)`);
    if (failRes.status !== 400) {
      throw new Error(`Validation check failed: expected 400, got ${failRes.status}`);
    }

    console.log('\nStep 8: Completing pickup directly with final price...');
    const extraDevices = [
      {
        brand: 'Samsung',
        model: 'Galaxy S21',
        storage: '256GB',
        condition: 'Good',
        estimatedPrice: 18000,
        imei: '887766554433221',
        photoUrl: '/uploads/photo-sam-s21.jpg'
      },
      {
        brand: 'OnePlus',
        model: '9 Pro',
        storage: '128GB',
        condition: 'Fair',
        estimatedPrice: 12000,
        photoUrl: '/uploads/photo-oneplus-9.jpg'
      }
    ];

    const pickupRes = await fetch(`${API_BASE}/operations/orders/${orderId}/pickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${partnerToken}`
      },
      body: JSON.stringify({
        finalPrice: 22000,
        extraDevices,
        notes: 'Customer handed over 2 additional devices. Fair condition.',
        distanceTravelled: 4.8,
        durationMinutes: 24
      })
    });

    if (pickupRes.status !== 200) {
      throw new Error(`Pickup failed: ${pickupRes.status} ${await pickupRes.text()}`);
    }
    const verifyData = await pickupRes.json();
    console.log(`✅ Direct pickup completed. Order status: ${verifyData.order.status} (Expected: picked_up)`);
    console.log(`✅ Extra devices logged: ${verifyData.order.extraDevices.length}`);

    // Verify invalid transition: transition from picked_up back to assigned or pickup again should fail
    console.log('\nStep 9: Verifying invalid transition - Cannot pickup an already picked up order...');
    const invalidTransitionRes = await fetch(`${API_BASE}/operations/orders/${orderId}/pickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${partnerToken}`
      },
      body: JSON.stringify({
        finalPrice: 22000
      })
    });
    console.log(`✅ Invalid transition rejected. Status code: ${invalidTransitionRes.status} (Expected: 400)`);
    if (invalidTransitionRes.status !== 400) {
      throw new Error(`Invalid transition not rejected: expected 400, got ${invalidTransitionRes.status}`);
    }

    // 10. WAREHOUSE STAFF AUTHENTICATES & RETRIEVES ORDER
    console.log('\nStep 10: Warehouse Auditor Alice logging in and fetching audit list...');
    const whLoginRes = await fetch(`${API_BASE}/operations/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: testWarehouse.employeeId, password: testWarehouse.password })
    });
    const whLoginData = await whLoginRes.json();
    warehouseToken = whLoginData.token;

    const whOrdersRes = await fetch(`${API_BASE}/operations/warehouse/orders`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${warehouseToken}` }
    });
    const whOrders = await whOrdersRes.json();
    const targetOrder = whOrders.find(o => o.orderId === poNumber);
    console.log(`✅ Warehouse orders loaded. Found PO in audit queue: ${!!targetOrder}`);

    // 11. SUBMIT WAREHOUSE AUDIT VERIFICATION
    console.log('\nStep 11: Submitting warehouse audit checklist verification...');
    const auditDevices = [
      {
        brand: 'Apple',
        model: 'iPhone 13',
        storage: '128GB',
        condition: 'Customer Registered',
        estimatedPrice: 22000,
        status: 'received'
      },
      {
        brand: 'Samsung',
        model: 'Galaxy S21',
        storage: '256GB',
        condition: 'Good',
        estimatedPrice: 18000,
        status: 'received'
      },
      {
        brand: 'OnePlus',
        model: '9 Pro',
        storage: '128GB',
        condition: 'Fair',
        estimatedPrice: 12000,
        status: 'damaged' // E.g. marked damaged at warehouse check
      }
    ];

    const auditSubmitRes = await fetch(`${API_BASE}/operations/warehouse/orders/${orderId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${warehouseToken}`
      },
      body: JSON.stringify({
        warehouseDevices: auditDevices,
        warehouseNotes: 'OnePlus device back panel is cracked. Status changed to Damaged.'
      })
    });

    if (auditSubmitRes.status !== 200) {
      throw new Error(`Warehouse audit submission failed: ${auditSubmitRes.status} ${await auditSubmitRes.text()}`);
    }
    const auditSubmitData = await auditSubmitRes.json();
    console.log(`✅ Warehouse check complete. Order state: ${auditSubmitData.order.status}`);
    console.log(`✅ Audit Status result: ${auditSubmitData.order.warehouseStatus}`);

    // 12. VERIFY FINAL REQUEST STATE
    console.log('\nStep 12: Checking final Request document status...');
    const reqStatusRes = await fetch(`${API_BASE}/admin/requests?search=${requestId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const reqStatusData = await reqStatusRes.json();
    const finalRequest = reqStatusData.requests[0];
    console.log(`✅ Final Customer Request status: "${finalRequest.status}" (Expected: completed)`);

    if (finalRequest.status !== 'completed') {
      throw new Error(`❌ Test Failed: Request status is ${finalRequest.status}, not completed.`);
    }

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! Operations flow working end-to-end.');

  } catch (err) {
    console.error('\n❌ INTEGRATION TEST FAILED:', err.message);
    process.exit(1);
  }
}

runIntegrationTest();
