#!/usr/bin/env node

const fetch = require('node-fetch');

const API_BASE = 'https://scrapme-backend.onrender.com/api';
// const API_BASE = 'http://localhost:3001/api'; // For local testing

async function testAdminLogin() {
    console.log('Testing admin login...');
    try {
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' })
        });

        const data = await response.json();
        console.log(`Status: ${response.status}`);

        if (response.status === 200) {
            console.log('✅ Admin login successful');
            console.log(`Token received: ${data.token ? 'Yes' : 'No'}`);
            return data.token;
        } else if (response.status === 429) {
            console.log('❌ Admin login rate limited');
            console.log(`Message: ${data.message}`);
            console.log('Note: Wait for rate limit to reset or check skipFailedRequests config');
        } else {
            console.log('❌ Admin login failed');
            console.log(`Message: ${data.message}`);
        }
    } catch (error) {
        console.log('❌ Error testing admin login:', error.message);
    }
    return null;
}

async function testUserRegistrationAndRequests() {
    console.log('\nTesting user registration and requests...');

    // Generate random test user
    const randomId = Math.floor(Math.random() * 10000);
    const testUser = {
        email: `test${randomId}@example.com`,
        password: 'Test123!',
        name: `Test User ${randomId}`
    };

    try {
        // Register user
        console.log('Registering test user...');
        const registerResponse = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser)
        });

        const registerData = await registerResponse.json();
        console.log(`Register status: ${registerResponse.status}`);

        if (registerResponse.status === 201 || registerResponse.status === 200) {
            console.log('✅ User registration successful');

            // Login to get token
            console.log('Logging in...');
            const loginResponse = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: testUser.email,
                    password: testUser.password
                })
            });

            const loginData = await loginResponse.json();

            if (loginResponse.status === 200 && loginData.token) {
                console.log('✅ User login successful');
                const userToken = loginData.token;

                // Test "My Sell Requests" endpoint
                console.log('Testing "My Sell Requests" endpoint...');
                const requestsResponse = await fetch(`${API_BASE}/requests/mine`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${userToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                console.log(`My Requests status: ${requestsResponse.status}`);

                if (requestsResponse.status === 200) {
                    const requestsData = await requestsResponse.json();
                    console.log(`✅ "My Sell Requests" loaded successfully`);
                    console.log(`   Found ${Array.isArray(requestsData) ? requestsData.length : '?'} requests`);
                } else if (requestsResponse.status === 429) {
                    console.log('❌ "My Sell Requests" rate limited');
                    const errorData = await requestsResponse.json();
                    console.log(`   Message: ${errorData.message}`);
                } else {
                    console.log('❌ "My Sell Requests" failed');
                    const errorData = await requestsResponse.json().catch(() => ({}));
                    console.log(`   Message: ${errorData.message || 'Unknown error'}`);
                }

                return userToken;
            } else {
                console.log('❌ User login failed');
                console.log(`   Message: ${loginData.message}`);
            }
        } else if (registerResponse.status === 429) {
            console.log('❌ User registration rate limited');
            console.log(`   Message: ${registerData.message}`);
        } else {
            console.log('❌ User registration failed');
            console.log(`   Message: ${registerData.message}`);
        }
    } catch (error) {
        console.log('❌ Error testing user flow:', error.message);
    }

    return null;
}

async function testRateLimitHeaders() {
    console.log('\nTesting rate limit headers...');
    try {
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }) // Intentional wrong password
        });

        console.log(`Status: ${response.status}`);
        console.log('Rate limit headers:');
        const headers = response.headers;
        ['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'retry-after'].forEach(header => {
            if (headers.get(header)) {
                console.log(`  ${header}: ${headers.get(header)}`);
            }
        });

        if (response.status === 401) {
            console.log('✅ Failed login correctly returns 401 (not counted toward limit with skipFailedRequests)');
        } else if (response.status === 429) {
            console.log('⚠️  Failed login counted toward limit (skipFailedRequests may not be working)');
        }
    } catch (error) {
        console.log('Error testing rate limits:', error.message);
    }
}

async function runAllTests() {
    console.log('=== Testing Fixes for Admin Login and Rate Limiting ===\n');

    // Wait a bit for rate limits to potentially reset
    console.log('Waiting 2 seconds before starting tests...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    await testAdminLogin();
    await testUserRegistrationAndRequests();
    await testRateLimitHeaders();

    console.log('\n=== Test Summary ===');
    console.log('1. Admin login should work with credentials: admin/admin123');
    console.log('2. User registration and "My Sell Requests" should not be rate limited');
    console.log('3. Failed attempts should not count toward limits (skipFailedRequests: true)');
    console.log('\nNote: If tests fail due to rate limiting, wait a few minutes and try again.');
    console.log('The new rate limits are:');
    console.log('  - General: 500 requests per 15 minutes');
    console.log('  - Auth: 200 requests per 15 minutes');
    console.log('  - Admin login: 20 requests per 15 minutes');
    console.log('  - Password reset: 10 requests per hour');
}

runAllTests().catch(console.error);