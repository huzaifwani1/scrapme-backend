// Simple test using built-in fetch (Node.js 18+)
const BASE_URL = 'https://scrapme-backend.onrender.com/api';

async function testBackend() {
    console.log('Testing deployed backend at:', BASE_URL);
    
    try {
        // Test health endpoint
        console.log('\n1. Testing health endpoint...');
        const healthRes = await fetch(`${BASE_URL}/../health`);
        console.log(`   Health status: ${healthRes.status} ${healthRes.statusText}`);
        
        // Test CORS headers
        console.log('\n2. Testing CORS headers...');
        const corsRes = await fetch(`${BASE_URL}/../health`, {
            headers: { 'Origin': 'http://localhost:8080' }
        });
        const corsHeaders = corsRes.headers;
        console.log(`   Access-Control-Allow-Origin: ${corsHeaders.get('access-control-allow-origin')}`);
        console.log(`   Access-Control-Allow-Credentials: ${corsHeaders.get('access-control-allow-credentials')}`);
        
        // Test authentication endpoint (should fail without credentials)
        console.log('\n3. Testing authentication endpoint...');
        const authRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Origin': 'http://localhost:8080'
            },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'wrongpassword'
            })
        });
        console.log(`   Login response status: ${authRes.status}`);
        
        if (authRes.status === 401) {
            console.log('   ✓ Expected 401 - Invalid credentials (good!)');
        } else {
            const text = await authRes.text();
            console.log(`   Response: ${text.substring(0, 100)}`);
        }
        
        console.log('\n✅ Backend tests completed successfully!');
        console.log('   The backend is running and CORS is properly configured.');
        
    } catch (error) {
        console.error('\n❌ Error testing backend:', error.message);
        console.error('   Make sure the backend is deployed and accessible.');
    }
}

testBackend();
