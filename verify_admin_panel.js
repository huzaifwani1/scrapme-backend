#!/usr/bin/env node

const fetch = require('node-fetch').default;

// Use local backend
const API_BASE = 'http://localhost:3001/api';

async function verifyAdminPanel() {
    console.log('Verifying admin panel displays correct prices...\n');

    try {
        // First, we need admin credentials to access admin endpoints
        // Let's try to login as admin (using known admin credentials if available)
        console.log('1. Attempting admin login...');
        const adminLoginResponse = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123'
            })
        });

        if (!adminLoginResponse.ok) {
            console.log('Admin login failed, trying to use regular user token...');
            // Create a regular user and use their token (admin endpoints might not work)
            const email = `test_admin_verify_${Date.now()}@example.com`;
            const registerResponse = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Admin Verify User',
                    email: email,
                    password: 'Password123'
                })
            });

            if (!registerResponse.ok) {
                throw new Error('Cannot create test user');
            }

            const registerData = await registerResponse.json();
            const token = registerData.token;

            // Create a test order
            console.log('\n2. Creating test order for verification...');
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
            console.log('Order created:', orderData._id);
            console.log('Order price:', orderData.price);
            console.log('Order priceNum:', orderData.priceNum);

            // Try to fetch via regular user endpoint to see what's stored
            console.log('\n3. Fetching order via user endpoint...');
            const userOrdersResponse = await fetch(`${API_BASE}/requests`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (userOrdersResponse.ok) {
                const userOrders = await userOrdersResponse.json();
                const myOrder = userOrders.find(o => o._id === orderData._id);
                if (myOrder) {
                    console.log('User API view:');
                    console.log('  Price:', myOrder.price);
                    console.log('  PriceNum:', myOrder.priceNum);
                }
            }

            // Since we can't access admin endpoints without admin credentials,
            // we'll simulate what the admin panel would see
            console.log('\n4. Simulating admin panel display:');
            console.log('   Admin panel uses r.price (not r.priceNum)');
            console.log('   Based on admin.js code, it displays:', orderData.price);
            console.log('   This should be: ₹250 (new price for 32GB)');

            if (orderData.price === '₹250') {
                console.log('   ✅ Admin panel would show CORRECT new price');
            } else if (orderData.price === '₹300') {
                console.log('   ❌ Admin panel would show OLD price');
            }

            return;
        }

        // If admin login succeeded
        const adminData = await adminLoginResponse.json();
        const adminToken = adminData.token;
        console.log('Admin login successful');

        // Fetch all requests via admin endpoint
        console.log('\n2. Fetching all requests via admin API...');
        const adminRequestsResponse = await fetch(`${API_BASE}/admin/requests`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (adminRequestsResponse.ok) {
            const allRequests = await adminRequestsResponse.json();
            console.log(`Total requests: ${allRequests.length}`);

            // Find our test orders (32GB and 128GB)
            const testOrders = allRequests.filter(r =>
                r.storage === '32GB' || r.storage === '128GB'
            );

            console.log('\n3. Checking admin panel data for test orders:');
            testOrders.forEach(order => {
                console.log(`\n  Order: ${order._id}`);
                console.log(`  Storage: ${order.storage}`);
                console.log(`  r.price (admin panel displays): ${order.price}`);
                console.log(`  r.priceNum (if available): ${order.priceNum || 'Not in response'}`);

                if (order.storage === '32GB') {
                    if (order.price === '₹250') {
                        console.log('  ✅ 32GB price is CORRECT in admin data');
                    } else if (order.price === '₹300') {
                        console.log('  ❌ 32GB price is OLD in admin data');
                    }
                } else if (order.storage === '128GB') {
                    if (order.price === '₹600') {
                        console.log('  ✅ 128GB price is CORRECT in admin data');
                    } else if (order.price === '₹700') {
                        console.log('  ❌ 128GB price is OLD in admin data');
                    }
                }
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.stack) console.error('Stack:', error.stack);
    }
}

verifyAdminPanel();