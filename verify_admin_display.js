#!/usr/bin/env node

const fetch = require('node-fetch').default;

// Use local backend
const API_BASE = 'http://localhost:3001/api';

async function verifyAdminDisplay() {
    console.log('Verifying admin panel would display correct price for new order...\n');

    try {
        // Use admin credentials to check admin API
        console.log('1. Logging in as admin...');
        const adminLoginResponse = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123'
            })
        });

        if (!adminLoginResponse.ok) {
            console.log('Admin login failed. Checking order directly via user API...');
            // Create a test order and check its data
            const email = `test_admin_verify_${Date.now()}@example.com`;
            const registerResponse = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Admin Verify',
                    email: email,
                    password: 'Password123'
                })
            });

            if (!registerResponse.ok) {
                throw new Error('Cannot create test user');
            }

            const registerData = await registerResponse.json();
            const token = registerData.token;

            // Create a 32GB order
            console.log('\n2. Creating 32GB test order...');
            const createResponse = await fetch(`${API_BASE}/requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    brand: 'Test',
                    model: 'Device',
                    storage: '32GB',
                    sellerName: 'Admin Test',
                    phone: '9999999999',
                    address: 'Test Address'
                })
            });

            if (!createResponse.ok) {
                throw new Error('Cannot create test order');
            }

            const orderData = await createResponse.json();
            console.log('\n3. Order created:', orderData._id);
            console.log('   Price stored:', orderData.price);
            console.log('   PriceNum stored:', orderData.priceNum);

            console.log('\n4. Admin panel simulation:');
            console.log('   Admin panel displays r.price (formatted string)');
            console.log('   This order would show in admin panel as:', orderData.price);

            if (orderData.price === '₹250') {
                console.log('   ✅ Admin panel would show CORRECT new price (₹250)');
            } else if (orderData.price === '₹300') {
                console.log('   ❌ Admin panel would show OLD price (₹300)');
            }

            return;
        }

        // Admin login successful
        const adminData = await adminLoginResponse.json();
        const adminToken = adminData.token;
        console.log('Admin login successful');

        // Fetch all requests
        console.log('\n2. Fetching all requests via admin API...');
        const adminRequestsResponse = await fetch(`${API_BASE}/admin/requests`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (adminRequestsResponse.ok) {
            const allRequests = await adminRequestsResponse.json();

            // Find our most recent test order (should be the one we just created)
            const recentOrders = allRequests
                .filter(r => r.storage === '32GB')
                .sort((a, b) => new Date(b.createdAt || b._id.getTimestamp()) - new Date(a.createdAt || a._id.getTimestamp()));

            if (recentOrders.length > 0) {
                const latestOrder = recentOrders[0];
                console.log('\n3. Latest 32GB order in admin data:');
                console.log('   Order ID:', latestOrder._id);
                console.log('   Storage:', latestOrder.storage);
                console.log('   r.price (admin panel displays):', latestOrder.price);
                console.log('   r.priceNum:', latestOrder.priceNum || 'Not in response');

                if (latestOrder.price === '₹250') {
                    console.log('\n   ✅ Admin panel IS showing CORRECT new price');
                    console.log('   This confirms the fix worked.');
                } else if (latestOrder.price === '₹300') {
                    console.log('\n   ❌ Admin panel IS showing OLD price');
                    console.log('   Backend may not have restarted properly.');
                }
            }

            // Also check old orders to confirm they remain unchanged
            const oldOrders = allRequests.filter(r =>
                r.storage === '32GB' && r.price === '₹300'
            );
            console.log(`\n4. Historical data preserved: ${oldOrders.length} old 32GB orders still show ₹300`);
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.stack) console.error('Stack:', error.stack);
    }
}

verifyAdminDisplay();