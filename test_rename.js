const fetch = require('node-fetch');

const BASE_URL = 'https://scrapme-backend.onrender.com/api';

async function testRegistration() {
    console.log('🧪 Testing user registration...');
    const randomEmail = `test${Date.now()}@example.com`;

    try {
        const response = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test User',
                email: randomEmail,
                password: 'password123',
                phone: '9876543210'
            })
        });

        const data = await response.json();
        console.log(`   Status: ${response.status}`);
        console.log(`   Response: ${JSON.stringify(data)}`);

        if (response.status === 201) {
            console.log('✅ Registration successful');
            return data.token;
        } else {
            console.log('❌ Registration failed');
            return null;
        }
    } catch (error) {
        console.log(`❌ Registration error: ${error.message}`);
        return null;
    }
}

async function testLogin() {
    console.log('\n🧪 Testing user login...');

    try {
        const response = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'password123'
            })
        });

        const data = await response.json();
        console.log(`   Status: ${response.status}`);

        if (response.status === 200) {
            console.log('✅ Login successful');
            return data.token;
        } else {
            console.log(`   Response: ${JSON.stringify(data)}`);
            console.log('⚠️  Login failed (expected if test user doesn\'t exist)');
            return null;
        }
    } catch (error) {
        console.log(`❌ Login error: ${error.message}`);
        return null;
    }
}

async function testPhoneSubmission(token) {
    console.log('\n🧪 Testing phone submission...');

    if (!token) {
        console.log('⚠️  Skipping - no auth token');
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/requests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                brand: 'Apple',
                model: 'iPhone 12',
                storage: '128GB',
                condition: 'Good',
                issues: 'Minor scratches'
            })
        });

        const data = await response.json();
        console.log(`   Status: ${response.status}`);
        console.log(`   Response: ${JSON.stringify(data)}`);

        if (response.status === 201) {
            console.log('✅ Phone submission successful');
        } else {
            console.log('❌ Phone submission failed');
        }
    } catch (error) {
        console.log(`❌ Submission error: ${error.message}`);
    }
}

async function testAdminEndpoint() {
    console.log('\n🧪 Testing admin endpoint...');

    try {
        const response = await fetch(`${BASE_URL}/admin/users/count`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        console.log(`   Status: ${response.status}`);

        if (response.status === 401) {
            console.log('✅ Admin endpoint requires auth (as expected)');
        } else if (response.status === 200) {
            const data = await response.json();
            console.log(`   User count: ${data.count}`);
            console.log('✅ Admin endpoint accessible');
        } else {
            console.log(`   Unexpected status: ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ Admin endpoint error: ${error.message}`);
    }
}

async function testServerInfo() {
    console.log('\n🧪 Testing server info...');

    try {
        const response = await fetch('https://scrapme-backend.onrender.com/');
        console.log(`   Status: ${response.status}`);

        if (response.status === 200) {
            console.log('✅ Server is responding');
        } else {
            console.log('⚠️  Server responded with non-200 status');
        }
    } catch (error) {
        console.log(`❌ Server info error: ${error.message}`);
    }
}

async function runTests() {
    console.log('🚀 Starting Scrapme application tests after rename...\n');

    await testServerInfo();
    const token = await testRegistration();
    await testLogin();
    await testPhoneSubmission(token);
    await testAdminEndpoint();

    console.log('\n📋 Test summary:');
    console.log('   - Server should show "Scrapme" in startup logs');
    console.log('   - Database should connect to "scrapme" database');
    console.log('   - Frontend should show "Scrapme" in page titles');
    console.log('   - Email service should use "Scrapme" in templates');
    console.log('\n✅ All tests completed. Check logs above for any failures.');
}

runTests().catch(console.error);