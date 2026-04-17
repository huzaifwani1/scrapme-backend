#!/usr/bin/env node

const fetch = require('node-fetch');

const API_BASE = 'https://scrapme-backend.onrender.com/api';
// const API_BASE = 'http://localhost:3001/api';

async function testUserFlow() {
    console.log('=== Diagnostic Test for "My Sell Requests" ===\n');

    // Step 1: Create a test user
    const randomId = Math.floor(Math.random() * 10000);
    const testUser = {
        email: `diagnostic${randomId}@test.com`,
        password: 'Test123!',
        name: `Diagnostic User ${randomId}`
    };

    console.log('1. Creating test user:', testUser.email);

    try {
        // Register
        const registerRes = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser)
        });

        const registerData = await registerRes.json();
        console.log(`   Register Status: ${registerRes.status}`);

        if (registerRes.status !== 201 && registerRes.status !== 200) {
            console.log(`   Error: ${registerData.message}`);
            if (registerRes.status === 429) {
                console.log('   ⚠️ Rate limited - wait and try again');
            }
            return;
        }

        console.log('   ✅ User created');

        // Step 2: Login to get token
        console.log('\n2. Logging in to get token...');
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: testUser.email,
                password: testUser.password
            })
        });

        const loginData = await loginRes.json();
        console.log(`   Login Status: ${loginRes.status}`);

        if (loginRes.status !== 200) {
            console.log(`   Error: ${loginData.message}`);
            return;
        }

        if (!loginData.token) {
            console.log('   Error: No token in response');
            return;
        }

        const userToken = loginData.token;
        console.log(`   ✅ Token received (length: ${userToken.length})`);

        // Step 3: Test /auth/me endpoint
        console.log('\n3. Testing /auth/me endpoint...');
        const meRes = await fetch(`${API_BASE}/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            }
        });

        const meData = await meRes.json();
        console.log(`   /auth/me Status: ${meRes.status}`);

        if (meRes.status === 200) {
            console.log(`   ✅ User authenticated: ${meData.name} (${meData.email})`);
        } else {
            console.log(`   Error: ${meData.message}`);
            console.log('   ⚠️ Token validation failed');
            return;
        }

        // Step 4: Test /requests/mine endpoint
        console.log('\n4. Testing /requests/mine endpoint...');
        const requestsRes = await fetch(`${API_BASE}/requests/mine`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`   /requests/mine Status: ${requestsRes.status}`);
        console.log(`   Headers:`);
        console.log(`     RateLimit-Limit: ${requestsRes.headers.get('ratelimit-limit')}`);
        console.log(`     RateLimit-Remaining: ${requestsRes.headers.get('ratelimit-remaining')}`);

        if (requestsRes.status === 200) {
            const requestsData = await requestsRes.json();
            console.log(`   ✅ Success! Found ${Array.isArray(requestsData) ? requestsData.length : '?'} requests`);
        } else if (requestsRes.status === 401) {
            const errorData = await requestsRes.json();
            console.log(`   ❌ Unauthorized: ${errorData.message}`);
            console.log('   ⚠️ Token is valid for /auth/me but not for /requests/mine');
        } else if (requestsRes.status === 403) {
            const errorData = await requestsRes.json();
            console.log(`   ❌ Forbidden: ${errorData.message}`);
        } else if (requestsRes.status === 429) {
            const errorData = await requestsRes.json();
            console.log(`   ❌ Rate limited: ${errorData.message}`);
        } else {
            const errorData = await requestsRes.json().catch(() => ({}));
            console.log(`   ❌ Error ${requestsRes.status}: ${errorData.message || 'Unknown error'}`);
        }

    } catch (error) {
        console.log(`\n❌ Network/System Error: ${error.message}`);
    }
}

async function testAdminLogin() {
    console.log('\n\n=== Diagnostic Test for Admin Login ===\n');

    console.log('Testing with username/password: admin/admin123');

    try {
        const res = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' })
        });

        console.log(`Status: ${res.status}`);
        console.log(`Headers:`);
        console.log(`  RateLimit-Limit: ${res.headers.get('ratelimit-limit')}`);
        console.log(`  RateLimit-Remaining: ${res.headers.get('ratelimit-remaining')}`);

        const data = await res.json();

        if (res.status === 200) {
            console.log(`✅ Success! Token received: ${data.token ? 'Yes' : 'No'}`);
        } else {
            console.log(`❌ Failed: ${data.message}`);
        }

    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

async function runDiagnostics() {
    console.log('Starting diagnostics...\n');
    await testUserFlow();
    await testAdminLogin();

    console.log('\n=== Diagnostic Summary ===');
    console.log('Check for:');
    console.log('1. Token validation mismatch between /auth/me and /requests/mine');
    console.log('2. Rate limiting headers');
    console.log('3. JWT secret consistency (JWT_SECRET vs ADMIN_JWT_SECRET)');
}

runDiagnostics().catch(console.error);