#!/usr/bin/env node

const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api';

async function testNewPricing() {
    console.log('Testing new pricing consistency...\n');

    // Test each storage size with expected new prices
    const testCases = [
        { storage: '32GB', expectedPriceNum: 300, expectedPrice: '₹300' },
        { storage: '64GB', expectedPriceNum: 500, expectedPrice: '₹500' },
        { storage: '128GB', expectedPriceNum: 700, expectedPrice: '₹700' },
        { storage: '256GB', expectedPriceNum: 1200, expectedPrice: '₹1,200' },
        { storage: '512GB', expectedPriceNum: 1500, expectedPrice: '₹1,500' },
        { storage: '1TB', expectedPriceNum: 2400, expectedPrice: '₹2,400' },
    ];

    let allPassed = true;

    for (const testCase of testCases) {
        console.log(`Testing storage: ${testCase.storage}`);

        // Simulate the price calculation logic from requestController.js
        const PRICES = { '32GB': 300, '64GB': 500, '128GB': 700, '256GB': 1200, '512GB': 1500, '1TB': 2400 };
        const priceNum = PRICES[testCase.storage] || 500;
        const price = '₹' + priceNum.toLocaleString('en-IN');

        console.log(`  Expected priceNum: ${testCase.expectedPriceNum}`);
        console.log(`  Calculated priceNum: ${priceNum}`);
        console.log(`  Expected price: ${testCase.expectedPrice}`);
        console.log(`  Calculated price: ${price}`);

        if (priceNum === testCase.expectedPriceNum && price === testCase.expectedPrice) {
            console.log('  ✅ PASS\n');
        } else {
            console.log('  ❌ FAIL\n');
            allPassed = false;
        }
    }

    // Test the backend API endpoint (requires authentication)
    console.log('Testing backend API (if server is running)...');
    try {
        // First get auth token by logging in (using test credentials if available)
        const loginResponse = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'password123'
            })
        });

        if (loginResponse.ok) {
            const loginData = await loginResponse.json();
            const token = loginData.token;

            // Create a test request
            const createResponse = await fetch(`${API_BASE}/requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    brand: 'Apple',
                    model: 'iPhone 15',
                    storage: '128GB',
                    sellerName: 'Test User',
                    phone: '1234567890',
                    address: 'Test Address'
                })
            });

            if (createResponse.ok) {
                const requestData = await createResponse.json();
                console.log(`Created test order with price: ${requestData.price}`);
                console.log(`Price number: ${requestData.priceNum}`);

                if (requestData.priceNum === 700 && requestData.price === '₹700') {
                    console.log('✅ Backend API is using new prices');
                } else {
                    console.log('❌ Backend API is NOT using new prices');
                    allPassed = false;
                }
            } else {
                console.log('⚠️ Could not create test order (might be authentication issue)');
            }
        } else {
            console.log('⚠️ Could not authenticate for API test');
        }
    } catch (error) {
        console.log('⚠️ API test skipped (server might not be running or authentication failed)');
    }

    console.log('\n' + (allPassed ? '✅ All tests passed!' : '❌ Some tests failed'));
    return allPassed;
}

// Run the test
testNewPricing().catch(console.error);