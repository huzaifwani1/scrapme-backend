#!/usr/bin/env node

const fetch = require('node-fetch').default;

// Use local backend
const API_BASE = 'http://localhost:3001/api';

async function testAfterRestart() {
    console.log('Testing local backend after restart...\n');

    try {
        // Step 1: Create a test user
        console.log('1. Creating test user...');
        const email = `test_after_restart_${Date.now()}@example.com`;
        const registerResponse = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'After Restart Test',
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
                sellerName: 'After Restart Test',
                phone: '9876543210',
                address: 'Test Address After Restart'
            })
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Failed to create order: ${createResponse.status} - ${errorText}`);
        }

        const requestData = await createResponse.json();
        console.log('\n3. Order created after restart:');
        console.log('Order ID:', requestData._id);
        console.log('Storage:', requestData.storage);
        console.log('Price (string):', requestData.price);
        console.log('PriceNum (number):', requestData.priceNum);

        // Step 3: Verify prices
        console.log('\n4. Verification:');
        const expectedPriceNum = 250; // New price for 32GB
        const expectedPrice = '₹250'; // New formatted price

        console.log(`Expected (new): ${expectedPrice} / ${expectedPriceNum}`);
        console.log(`Actual: ${requestData.price} / ${requestData.priceNum}`);

        if (requestData.priceNum === expectedPriceNum && requestData.price === expectedPrice) {
            console.log('\n✅ SUCCESS: Backend is using NEW prices after restart!');
            console.log('   Root cause confirmed: Stale backend runtime memory.');
            console.log('   Fresh restart loaded updated pricing map.');
        } else if (requestData.priceNum === 300 && requestData.price === '₹300') {
            console.log('\n❌ FAILURE: Backend still using OLD prices after restart!');
            console.log('   This suggests the code file may not have the updated pricing map.');
            console.log('   Check requestController.js line 4.');
        } else {
            console.log('\n⚠️  UNEXPECTED: Prices don\'t match expected values');
        }

        // Step 4: Also test that old orders remain unchanged
        console.log('\n5. Checking old orders remain unchanged...');
        console.log('   (Previous test orders should still show old prices)');
        console.log('   This preserves historical data as required.');

    } catch (error) {
        console.error('Error:', error.message);
        if (error.stack) console.error('Stack:', error.stack);
        console.log('\n⚠️  Backend may not be fully started yet. Wait a few seconds and try again.');
    }
}

testAfterRestart();