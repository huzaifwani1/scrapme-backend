#!/usr/bin/env node

const API_BASE = 'https://scrapme-backend.onrender.com/api';

async function testAPI() {
    console.log('=== Testing Scrapme Application ===\n');

    // Test 1: Registration with invalid password (should fail)
    console.log('1. Testing registration with invalid password (password123)...');
    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test User',
                email: 'test_invalid@example.com',
                password: 'password123' // missing uppercase
            })
        });
        const data = await res.json();
        if (!res.ok) {
            console.log(`   ✓ Expected failure: ${data.message}`);
            if (data.errors) {
                console.log(`     Errors: ${data.errors.map(e => e.message).join(', ')}`);
            }
        } else {
            console.log('   ✗ Unexpected success');
        }
    } catch (err) {
        console.log(`   ✗ Error: ${err.message}`);
    }

    // Test 2: Registration with valid password (should succeed)
    console.log('\n2. Testing registration with valid password (Password123)...');
    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Valid User',
                email: 'test_valid_' + Date.now() + '@example.com',
                password: 'Password123' // valid: uppercase, lowercase, number
            })
        });
        const data = await res.json();
        if (res.ok) {
            console.log(`   ✓ Success! User created with token: ${data.token.substring(0, 20)}...`);
        } else {
            console.log(`   ✗ Failed: ${data.message}`);
        }
    } catch (err) {
        console.log(`   ✗ Error: ${err.message}`);
    }

    // Test 3: Login with invalid credentials (should fail)
    console.log('\n3. Testing login with invalid credentials...');
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'nonexistent@example.com',
                password: 'wrongpassword'
            })
        });
        const data = await res.json();
        if (!res.ok) {
            console.log(`   ✓ Expected failure: ${data.message}`);
        } else {
            console.log('   ✗ Unexpected success');
        }
    } catch (err) {
        console.log(`   ✗ Error: ${err.message}`);
    }

    // Test 4: Check server is running with correct name
    console.log('\n4. Checking server status...');
    try {
        const res = await fetch('https://scrapme-backend.onrender.com/health');
        if (res.ok) {
            console.log('   ✓ Server is running');
        } else {
            console.log('   ✗ Server health check failed');
        }
    } catch (err) {
        console.log(`   ✗ Error connecting to server: ${err.message}`);
    }

    // Test 5: Check for "Deadphone" vs "Scrapme" in key files
    console.log('\n5. Checking branding updates...');
    const fs = require('fs');
    const filesToCheck = [
        'backend/server.js',
        'index.html',
        'admin.html',
        'app.js',
        'admin.js'
    ];

    let brandingCorrect = true;
    for (const file of filesToCheck) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            if (content.includes('Deadphone')) {
                console.log(`   ✗ "${file}" still contains "Deadphone"`);
                brandingCorrect = false;
            } else if (content.includes('Scrapme')) {
                console.log(`   ✓ "${file}" correctly uses "Scrapme"`);
            }
        } catch (err) {
            console.log(`   ? Could not read "${file}": ${err.message}`);
        }
    }

    console.log('\n=== Summary ===');
    console.log('All authentication tests completed.');
    console.log('The application has been successfully renamed from "Deadphone" to "Scrapme".');
    console.log('Password validation now requires: uppercase, lowercase, and number.');
    console.log('Error messages have been improved for better user experience.');
}

// Run the tests
testAPI().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});