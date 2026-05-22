#!/usr/bin/env node

const fetch = require('node-fetch');

const API_BASE = 'https://scrapme-backend.onrender.com/api';

async function createTestOrder() {
    console.log('Creating a fresh 32GB test order to inspect database storage...\n');

    try {
        // Step 1: Register a test user
        console.log('1. Registering test user...');
        const registerResponse = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test User Diagnostic',
                email: `test_diagnostic_${Date.now()}@example.com`,
                password: 'password123'
            })
        });

        if (!registerResponse.ok) {
            console.log('Registration failed, trying login with existing test user...');
            // Try to login with existing test credentials
            const loginResponse = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'test@example.com',
                    password: 'password123'
                })
            });

            if (!loginResponse.ok) {
                throw new Error('Cannot authenticate - both registration and login failed');
            }

            const loginData = await loginResponse.json();
            var token = loginData.token;
            console.log('Logged in with existing test user');
        } else {
            const registerData = await registerResponse.json();
            var token = registerData.token;
            console.log('Registered new test user');
        }

        // Step 2: Create a 32GB order
        console.log('\n2. Creating 32GB test order...');
        const createResponse = await fetch(`${API_BASE}/requests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                brand: 'Apple',
                model: 'iPhone 15',
                storage: '32GB',
                sellerName: 'Diagnostic Test User',
                phone: '9876543210',
                address: 'Test Address for Diagnostic'
            })
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Failed to create order: ${createResponse.status} - ${errorText}`);
        }

        const requestData = await createResponse.json();
        console.log('\n3. Order created successfully!');
        console.log('Order ID:', requestData._id);
        console.log('Storage:', requestData.storage);
        console.log('Price (string):', requestData.price);
        console.log('PriceNum (number):', requestData.priceNum);
        console.log('Full response:', JSON.stringify(requestData, null, 2));

        // Step 3: Fetch the order from admin endpoint to see what admin panel sees
        console.log('\n4. Fetching order via admin API...');
        const adminResponse = await fetch(`${API_BASE}/admin/requests`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (adminResponse.ok) {
            const allRequests = await adminResponse.json();
            const myOrder = allRequests.find(r => r._id === requestData._id);
            if (myOrder) {
                console.log('\nAdmin API view of the order:');
                console.log('Price field (r.price):', myOrder.price);
                console.log('PriceNum field (r.priceNum):', myOrder.priceNum || 'Not present in admin response');
                console.log('Full admin view:', JSON.stringify(myOrder, null, 2));
            }
        }

        // Step 4: Analyze the issue
        console.log('\n5. Analysis:');
        const expectedPriceNum = 250; // New price for 32GB
        const expectedPrice = '₹250'; // New formatted price

        console.log(`Expected new price (priceNum): ${expectedPriceNum}`);
        console.log(`Expected new price (price): ${expectedPrice}`);
        console.log(`Actual stored priceNum: ${requestData.priceNum}`);
        console.log(`Actual stored price: ${requestData.price}`);

        if (requestData.priceNum === expectedPriceNum && requestData.price === expectedPrice) {
            console.log('✅ SUCCESS: Both price and priceNum contain updated values');
            console.log('   The backend is using the new pricing map correctly.');
        } else {
            console.log('❌ ISSUE: Price mismatch detected');
            console.log('   Possible causes:');
            console.log('   - Backend server not restarted after code changes');
            console.log('   - Cached pricing map in memory');
            console.log('   - Different environment (staging vs production)');

            if (requestData.priceNum === 300 && requestData.price === '₹300') {
                console.log('   → Detected OLD price (300) instead of NEW price (250)');
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

createTestOrder();