#!/usr/bin/env node

const fetch = require('node-fetch').default;

// Use local backend
const API_BASE = 'http://localhost:3001/api';

async function testLocalOrder() {
    console.log('Testing local backend pricing with 32GB order...\n');

    try {
        // Step 1: Register a test user
        console.log('1. Registering test user...');
        const email = `test_local_${Date.now()}@example.com`;
        const registerResponse = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Local Test User',
                email: email,
                password: 'Password123'
            })
        });

        if (!registerResponse.ok) {
            const errorText = await registerResponse.text();
            throw new Error(`Registration failed: ${registerResponse.status} - ${errorText}`);
        }

        const registerData = await registerResponse.json();
        const token = registerData.token;
        console.log(`Registered user: ${email}`);

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
                sellerName: 'Local Test User',
                phone: '9876543210',
                address: 'Local Test Address'
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

        // Step 3: Check if prices match expected new values
        console.log('\n4. Verifying prices...');
        const expectedPriceNum = 250; // New price for 32GB
        const expectedPrice = '₹250'; // New formatted price

        console.log(`Expected priceNum: ${expectedPriceNum}`);
        console.log(`Actual priceNum: ${requestData.priceNum}`);
        console.log(`Expected price: ${expectedPrice}`);
        console.log(`Actual price: ${requestData.price}`);

        if (requestData.priceNum === expectedPriceNum && requestData.price === expectedPrice) {
            console.log('\n✅ SUCCESS: Local backend is using NEW prices!');
            console.log('   Both price and priceNum contain updated values (250).');
        } else if (requestData.priceNum === 300 && requestData.price === '₹300') {
            console.log('\n❌ ISSUE: Local backend is using OLD prices!');
            console.log('   Both price and priceNum contain old values (300).');
            console.log('   This means the backend server needs to be restarted.');
        } else {
            console.log('\n⚠️  UNEXPECTED: Prices don\'t match expected values');
            console.log('   Check the pricing map in requestController.js');
        }

        // Step 4: Also test 128GB to be sure
        console.log('\n5. Testing 128GB order...');
        const createResponse128 = await fetch(`${API_BASE}/requests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                brand: 'Samsung',
                model: 'Galaxy S24',
                storage: '128GB',
                sellerName: 'Local Test User',
                phone: '9876543211',
                address: 'Local Test Address 2'
            })
        });

        if (createResponse128.ok) {
            const requestData128 = await createResponse128.json();
            console.log('128GB Order - Price:', requestData128.price, 'PriceNum:', requestData128.priceNum);

            if (requestData128.priceNum === 600 && requestData128.price === '₹600') {
                console.log('✅ 128GB price is correct (600)');
            } else if (requestData128.priceNum === 700 && requestData128.price === '₹700') {
                console.log('❌ 128GB price is OLD (700 instead of 600)');
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.stack) console.error('Stack:', error.stack);
    }
}

testLocalOrder();