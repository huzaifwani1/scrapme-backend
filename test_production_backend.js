#!/usr/bin/env node

const fetch = require('node-fetch').default;

// Test production backend
const API_BASE = 'https://scrapme-backend.onrender.com/api';

async function testProductionBackend() {
    console.log('Testing production backend pricing...\n');

    try {
        // Step 1: Try to create a test user and order on production
        console.log('1. Testing production backend authentication...');
        const email = `test_prod_${Date.now()}@example.com`;
        const registerResponse = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Production Test',
                email: email,
                password: 'Password123'
            })
        });

        if (!registerResponse.ok) {
            const errorText = await registerResponse.text();
            console.log(`Registration failed: ${registerResponse.status} - ${errorText}`);
            console.log('\nTrying alternative approach: Check existing orders via public endpoint...');

            // Try to check if there's a public endpoint or use a different approach
            // For now, let's just check the backend response time and see if it's alive
            const healthResponse = await fetch(`${API_BASE}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }).catch(() => null);

            if (healthResponse && healthResponse.ok) {
                console.log('Backend health check: OK');
            } else {
                console.log('Cannot directly test production backend due to authentication requirements.');
                console.log('\nAlternative: Check if code is deployed by examining response headers...');

                // Make a simple GET request to see last deployment
                const simpleResponse = await fetch(API_BASE.replace('/api', ''), {
                    method: 'GET'
                }).catch(() => null);

                if (simpleResponse) {
                    console.log('Backend URL responds with status:', simpleResponse.status);
                    const serverHeader = simpleResponse.headers.get('server');
                    console.log('Server header:', serverHeader);
                }
            }

            return;
        }

        const registerData = await registerResponse.json();
        const token = registerData.token;
        console.log(`Registered user: ${email}`);

        // Step 2: Create a 32GB order on production
        console.log('\n2. Creating 32GB test order on production...');
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
                sellerName: 'Prod Test User',
                phone: '9876543210',
                address: 'Production Test Address'
            })
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            console.log(`Order creation failed: ${createResponse.status} - ${errorText}`);
            return;
        }

        const requestData = await createResponse.json();
        console.log('\n3. Production order created!');
        console.log('Order ID:', requestData._id);
        console.log('Storage:', requestData.storage);
        console.log('Price (string):', requestData.price);
        console.log('PriceNum (number):', requestData.priceNum);

        // Step 3: Analyze
        console.log('\n4. Analysis:');
        const expectedPriceNum = 250; // New price for 32GB
        const expectedPrice = '₹250'; // New formatted price

        console.log(`Expected (new): ${expectedPrice} / ${expectedPriceNum}`);
        console.log(`Actual: ${requestData.price} / ${requestData.priceNum}`);

        if (requestData.priceNum === expectedPriceNum && requestData.price === expectedPrice) {
            console.log('✅ PRODUCTION backend is using NEW prices!');
            console.log('   The admin panel should show updated prices for NEW orders.');
        } else if (requestData.priceNum === 300 && requestData.price === '₹300') {
            console.log('❌ PRODUCTION backend is still using OLD prices!');
            console.log('   The backend server needs to be restarted on Render.');
            console.log('\n   Action required:');
            console.log('   1. Go to Render dashboard');
            console.log('   2. Find scrapme-backend service');
            console.log('   3. Click "Manual Deploy" → "Clear build cache & deploy"');
            console.log('   4. Or restart the service manually');
        } else {
            console.log('⚠️  Unexpected price values');
        }

    } catch (error) {
        console.error('Error testing production:', error.message);
        console.error('This suggests the production backend may be down or unreachable.');
    }
}

testProductionBackend();