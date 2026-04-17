#!/usr/bin/env node

const BASE_URL = 'http://localhost:3001/api';

async function testAdminLogin() {
    console.log('Testing admin login...');
    try {
        const response = await fetch(`${BASE_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' })
        });

        const data = await response.json();
        console.log(`Admin login response: ${response.status} ${response.statusText}`);
        console.log('Response data:', data);

        if (response.ok) {
            console.log('✅ Admin login successful');
            return data.token;
        } else {
            console.log('❌ Admin login failed');
            return null;
        }
    } catch (error) {
        console.log('❌ Admin login error:', error.message);
        return null;
    }
}

async function testMyRequests(token) {
    console.log('\nTesting "My Sell Requests" endpoint...');
    try {
        const response = await fetch(`${BASE_URL}/requests/mine`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(`My Requests response: ${response.status} ${response.statusText}`);

        if (response.ok) {
            const data = await response.json();
            console.log('✅ "My Sell Requests" endpoint works');
            console.log(`Response has ${data.requests ? data.requests.length : 0} requests`);
            return true;
        } else {
            const errorText = await response.text();
            console.log('❌ "My Sell Requests" endpoint failed:', errorText);
            return false;
        }
    } catch (error) {
        console.log('❌ "My Requests" error:', error.message);
        return false;
    }
}

async function testRateLimiting() {
    console.log('\nTesting rate limiting on auth endpoints...');

    // Test multiple rapid requests to auth endpoints
    const requests = [];
    for (let i = 0; i < 10; i++) {
        requests.push(
            fetch(`${BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: `test${i}@example.com`, password: 'password' })
            })
        );
    }

    try {
        const responses = await Promise.all(requests);
        const statuses = responses.map(r => r.status);

        const successCount = statuses.filter(s => s === 200 || s === 201).length;
        const rateLimitedCount = statuses.filter(s => s === 429).length;
        const errorCount = statuses.filter(s => s >= 400 && s !== 429).length;

        console.log(`Rate limiting test results:`);
        console.log(`  Total requests: ${responses.length}`);
        console.log(`  Successful: ${successCount}`);
        console.log(`  Rate limited (429): ${rateLimitedCount}`);
        console.log(`  Other errors: ${errorCount}`);

        if (rateLimitedCount > 0) {
            console.log('✅ Rate limiting is working on auth endpoints');
        } else {
            console.log('⚠️ No rate limiting detected on auth endpoints (may need more requests)');
        }
    } catch (error) {
        console.log('❌ Rate limiting test error:', error.message);
    }
}

async function testDataEndpointsWithoutAuth() {
    console.log('\nTesting data endpoints without authentication...');

    const endpoints = [
        `${BASE_URL}/requests`,
        `${BASE_URL}/admin/users/count`,
        `${BASE_URL}/admin/requests`
    ];

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            console.log(`${endpoint}: ${response.status} ${response.statusText}`);

            // These should return 401 (unauthorized) not 429 (rate limited)
            if (response.status === 429) {
                console.log(`  ❌ ${endpoint} is being rate limited (should not be)`);
            } else if (response.status === 401) {
                console.log(`  ✅ ${endpoint} returns 401 (unauthorized) as expected`);
            } else {
                console.log(`  ⚠️ ${endpoint} returned ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ ${endpoint} error:`, error.message);
        }
    }
}

async function runAllTests() {
    console.log('=== Testing Rate Limiting Fix ===\n');

    // Test 1: Admin login
    const adminToken = await testAdminLogin();

    // Test 2: My Sell Requests (if we had a user token)
    console.log('\nNote: Need user token for "My Sell Requests" test');

    // Test 3: Rate limiting on auth endpoints
    await testRateLimiting();

    // Test 4: Data endpoints without rate limiting
    await testDataEndpointsWithoutAuth();

    console.log('\n=== Test Complete ===');
    console.log('\nSummary:');
    console.log('1. Admin login should work without "Invalid credentials" error');
    console.log('2. Rate limiting should only apply to auth endpoints, not data endpoints');
    console.log('3. "My Sell Requests" should load without rate limiting errors');
    console.log('\nIf admin login fails with "Invalid credentials", check adminController.js');
    console.log('If data endpoints return 429, check that global rate limiter was removed from server.js');
}

// Run tests
runAllTests().catch(console.error);