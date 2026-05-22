#!/usr/bin/env node

const fetch = require('node-fetch').default;

// Local backend (same as admin.js now uses)
const API_BASE = 'http://localhost:3001/api';

async function testAdminPanelLocal() {
    console.log('Testing admin panel connection to local backend...\n');

    try {
        // Step 1: Admin login
        console.log('1. Admin login to local backend...');
        const adminLoginResponse = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123'
            })
        });

        if (!adminLoginResponse.ok) {
            const errorText = await adminLoginResponse.text();
            console.log(`Admin login failed: ${adminLoginResponse.status} - ${errorText}`);
            console.log('\nTrying to create a test order and check directly...');

            // Create a test user and order
            const email = `test_admin_local_${Date.now()}@example.com`;
            const registerResponse = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Admin Local Test',
                    email: email,
                    password: 'Password123'
                })
            });

            if (!registerResponse.ok) {
                throw new Error('Cannot create test user');
            }

            const registerData = await registerResponse.json();
            const token = registerData.token;

            // Create 32GB order
            console.log('\n2. Creating 32GB test order...');
            const createResponse = await fetch(`${API_BASE}/requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    brand: 'Local Test',
                    model: 'Device',
                    storage: '32GB',
                    sellerName: 'Local Admin Test',
                    phone: '9999999999',
                    address: 'Local Test Address'
                })
            });

            if (!createResponse.ok) {
                throw new Error('Cannot create test order');
            }

            const orderData = await createResponse.json();
            console.log('\n3. Order created:', orderData._id);
            console.log('   Price stored:', orderData.price);
            console.log('   PriceNum stored:', orderData.priceNum);

            console.log('\n4. What admin panel would display:');
            console.log('   With admin.js now pointing to localhost:3001');
            console.log('   Admin panel fetches from:', API_BASE);
            console.log('   It would receive r.price:', orderData.price);

            if (orderData.price === '₹250') {
                console.log('   ✅ Admin panel WOULD show CORRECT price (₹250)');
                console.log('\n   User must:');
                console.log('   1. Hard refresh admin panel (Ctrl+Shift+R)');
                console.log('   2. Clear browser cache if needed');
                console.log('   3. Re-login to admin panel');
            } else {
                console.log('   ❌ Unexpected price:', orderData.price);
            }

            return;
        }

        // Admin login successful
        const adminData = await adminLoginResponse.json();
        const adminToken = adminData.token;
        console.log('Admin login successful');

        // Fetch all requests
        console.log('\n2. Fetching requests from local backend (what admin panel sees)...');
        const adminRequestsResponse = await fetch(`${API_BASE}/admin/requests`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (adminRequestsResponse.ok) {
            const allRequests = await adminRequestsResponse.json();

            // Find recent 32GB orders
            const recent32GB = allRequests
                .filter(r => r.storage === '32GB')
                .sort((a, b) => new Date(b.createdAt || b._id.getTimestamp()) - new Date(a.createdAt || a._id.getTimestamp()));

            if (recent32GB.length > 0) {
                const latest = recent32GB[0];
                console.log('\n3. Most recent 32GB order in local backend:');
                console.log('   Order ID:', latest._id);
                console.log('   r.price (admin panel displays):', latest.price);
                console.log('   r.priceNum:', latest.priceNum || 'N/A');

                if (latest.price === '₹250') {
                    console.log('\n   ✅ LOCAL admin panel data shows CORRECT price');
                    console.log('   The issue was: admin.js was connecting to PRODUCTION backend');
                    console.log('   Now fixed: admin.js points to localhost:3001');
                    console.log('\n   User action required:');
                    console.log('   - Hard refresh browser (Ctrl+Shift+R)');
                    console.log('   - Or clear browser cache for admin.html');
                } else if (latest.price === '₹300') {
                    console.log('\n   ❌ LOCAL admin panel data shows OLD price');
                    console.log('   Even local backend returning old prices');
                    console.log('   Check if local backend restarted properly');
                }
            }

            // Count old vs new
            const newPrices = allRequests.filter(r => r.storage === '32GB' && r.price === '₹250').length;
            const oldPrices = allRequests.filter(r => r.storage === '32GB' && r.price === '₹300').length;
            console.log(`\n4. Summary: ${newPrices} new-priced (₹250) vs ${oldPrices} old-priced (₹300) 32GB orders`);
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.stack) console.error('Stack:', error.stack);
    }
}

testAdminPanelLocal();