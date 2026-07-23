#!/usr/bin/env node

const mongoose = require('mongoose');
const crypto = require('crypto');
const { exec } = require('child_process');
require('dotenv').config();

const API_BASE = 'http://localhost:3001/api';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapme';

async function runSecurityHardeningTests() {
  console.log('🚀 === ScrapMe Security Hardening Verification Tests ===\n');

  let adminToken = '';
  let customerToken = '';
  let partnerToken = '';
  let partnerId = '';
  let requestId = '';
  let orderId = '';
  let orderId2 = '';

  const rand = Math.floor(Math.random() * 100000);

  try {
    // 0. CONNECT TO DB FOR SEEDING
    await mongoose.connect(MONGO_URI);
    console.log('✅ Step 0: Connected to MongoDB.');

    // 1. VERIFY TASK 1: STARTUP BLOCKED ON MISSING ENV VARIABLES
    console.log('\nStep 1: Verifying Task 1 (Startup blocked if environment variables are missing)...');
    const fs = require('fs');
    const path = require('path');
    
    const envPath = path.join(__dirname, '.env');
    const envBakPath = path.join(__dirname, '.env.bak');
    let envRenamed = false;

    if (fs.existsSync(envPath)) {
      fs.renameSync(envPath, envBakPath);
      envRenamed = true;
    }

    await new Promise((resolve) => {
      const env = { ...process.env };
      delete env.JWT_SECRET;
      delete env.ADMIN_JWT_SECRET;
      delete env.MONGO_URI;

      const child = exec('node server.js', { env, cwd: __dirname }, (error, stdout, stderr) => {
        const output = stdout + stderr;
        if (output.includes('CRITICAL CONFIGURATION ERROR') || output.includes('Missing required environment variables')) {
          console.log('✅ Task 1 Verified: Server correctly blocked startup and logged configuration error.');
        } else {
          console.log('❌ Task 1 Failed: Server did not print error logs or exited incorrectly.', output);
        }
        resolve();
      });
      // Kill the child after 2 seconds
      setTimeout(() => child.kill(), 2000);
    });

    // Restore .env file
    if (envRenamed) {
      fs.renameSync(envBakPath, envPath);
    }

    // Login for subsequent tests
    console.log('\nAuthenticating clients for security tests...');
    
    // Admin login
    const adminLoginRes = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    adminToken = (await adminLoginRes.json()).token;

    // Create a Pickup Partner
    const partnerRegRes = await fetch(`${API_BASE}/operations/admin/partners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'Sec Bob',
        phone: '9911223344',
        employeeId: `PP-SEC-${rand}`,
        password: 'securepwd123',
        role: 'partner',
        email: `sec-bob-${rand}@example.com`
      })
    });
    const partnerObj = await partnerRegRes.json();
    partnerId = partnerObj._id;

    // Partner Login
    const partnerLoginRes = await fetch(`${API_BASE}/operations/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: `PP-SEC-${rand}`, password: 'securepwd123' })
    });
    partnerToken = (await partnerLoginRes.json()).token;

    // Register a Customer
    const custRegRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sec Customer', email: `sec-cust-${rand}@example.com`, password: 'Custpwd123' })
    });
    
    const custLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `sec-cust-${rand}@example.com`, password: 'Custpwd123' })
    });
    customerToken = (await custLoginRes.json()).token;

    // Submit Customer Request
    const reqCreateRes = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customerToken}` },
      body: JSON.stringify({
        brand: 'Google', model: 'Pixel 7', storage: '128GB', price: '₹30,000', priceNum: 30000,
        sellerName: 'Sec Customer', phone: '9900119900', address: 'Security Boulevard, Bangalore'
      })
    });
    const reqData = await reqCreateRes.json();
    requestId = reqData._id;

    // 2. VERIFY TASK 4: PREVENT DUPLICATE PICKUP ORDERS
    console.log('\nStep 2: Verifying Task 4 (Prevent Duplicate Pickup Orders)...');
    
    // Attempt 1: Assign Request to Partner
    const assignRes1 = await fetch(`${API_BASE}/operations/admin/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ requestId, partnerId })
    });
    const orderData1 = await assignRes1.json();
    orderId = orderData1._id;
    console.log(`- Assignment 1 Status: ${assignRes1.status} (Expected: 201), Order: ${orderData1.orderId}`);

    // Attempt 2: Re-assign the same Request again
    const assignRes2 = await fetch(`${API_BASE}/operations/admin/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ requestId, partnerId })
    });
    const orderData2 = await assignRes2.json();
    console.log(`- Assignment 2 Status: ${assignRes2.status} (Expected: 400), Response: "${orderData2.message}"`);
    
    if (assignRes2.status === 400 && orderData2.message.includes('already been assigned')) {
      console.log('✅ Task 4 Verified: Duplicate order assignments blocked successfully.');
    } else {
      throw new Error(`Task 4 Failed: Duplicate assignment returned status ${assignRes2.status}`);
    }

    // 3. VERIFY TASK 2: SECURE OTP (LOCKOUTS AFTER 5 ATTEMPTS) - SKIPPED
    console.log('\nStep 3: Verifying Task 2 (OTP Lockouts and verification constraints)... SKIPPED (OTP functionality has been completely removed)');

    // 4. VERIFY TASK 5: SECURE IMAGE UPLOADS
    console.log('\nStep 4: Verifying Task 5 (Secure Image Uploads size & type validations)...');

    // 4a. Size boundary check (6MB payload > 5MB limit)
    console.log('- Sending 6MB payload (exceeding 5MB limit)...');
    const largePayload = 'data:image/jpeg;base64,' + 'A'.repeat(8 * 1024 * 1024); // ~8MB string, ~6MB decoded size
    const sizeRes = await fetch(`${API_BASE}/operations/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${partnerToken}` },
      body: JSON.stringify({ base64Data: largePayload })
    });
    const sizeText = await sizeRes.text();
    console.log(`  Upload Status: ${sizeRes.status} (Expected: 400 or 413), Response: "${sizeText.substring(0, 100)}"`);
    if (sizeRes.status !== 400 && sizeRes.status !== 413) {
      throw new Error('Task 5 Failed: Large upload size check not enforced.');
    }

    // 4b. MIME Type check
    console.log('- Sending executable file base64 data (text/html)...');
    const htmlPayload = 'data:text/html;base64,PGh0bWw+aGFja2VkPC9odG1sPg==';
    const mimeRes = await fetch(`${API_BASE}/operations/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${partnerToken}` },
      body: JSON.stringify({ base64Data: htmlPayload })
    });
    const mimeData = await mimeRes.json();
    console.log(`  Upload Status: ${mimeRes.status} (Expected: 400), Response: "${mimeData.message}"`);
    if (mimeRes.status !== 400 || !mimeData.message.includes('Only JPEG, PNG, GIF, and WEBP')) {
      throw new Error('Task 5 Failed: MIME type validation not enforced.');
    }

    // 4c. Valid image check
    console.log('- Sending valid image payload...');
    const validPayload = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const validRes = await fetch(`${API_BASE}/operations/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${partnerToken}` },
      body: JSON.stringify({ base64Data: validPayload })
    });
    const validData = await validRes.json();
    console.log(`  Upload Status: ${validRes.status} (Expected: 200), Photo URL: "${validData.photoUrl}"`);
    if (validRes.status === 200 && validData.photoUrl) {
      console.log('✅ Task 5 Verified: Image uploads strictly validated and protected.');
    } else {
      throw new Error(`Task 5 Failed: Valid image upload rejected. Status: ${validRes.status}`);
    }

    console.log('\n🎉 ALL SECURITY HARDENING TESTS PASSED!');

  } catch (err) {
    console.error('\n❌ SECURITY HARDENING TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nMongoose disconnected.');
  }
}

runSecurityHardeningTests();
