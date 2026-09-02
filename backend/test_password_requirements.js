const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { validateRegister, sanitizeInput } = require('./src/middleware/validate');
const { register } = require('./src/controllers/authController');

// Set JWT secret for test environment
process.env.JWT_SECRET = 'test_secret_key_123';

async function runPasswordValidationTests() {
  console.log('🧪 Starting Password Requirements Test Suite...\n');

  const mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  const app = express();
  app.use(express.json());
  app.use(sanitizeInput);
  app.post('/api/auth/register', validateRegister, register);

  // Helper to make test requests
  async function testRegister(name, email, password) {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const response = await fetch(`http://localhost:${port}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      return { status: response.status, ok: response.ok, body: data };
    } finally {
      server.close();
    }
  }

  const testCases = [
    {
      name: 'Exactly 5 characters (abcde)',
      password: 'abcde',
      email: 'test5a@example.com',
      shouldPass: true,
    },
    {
      name: 'Exactly 5 characters (12345)',
      password: '12345',
      email: 'test5b@example.com',
      shouldPass: true,
    },
    {
      name: 'Simple 5-character password without capitals/symbols/numbers (hello)',
      password: 'hello',
      email: 'test5c@example.com',
      shouldPass: true,
    },
    {
      name: 'Simple 5-character password (scrap)',
      password: 'scrap',
      email: 'test5d@example.com',
      shouldPass: true,
    },
    {
      name: '6+ characters (123456)',
      password: '123456',
      email: 'test6a@example.com',
      shouldPass: true,
    },
    {
      name: '6+ characters (Hello1!)',
      password: 'Hello1!',
      email: 'test6b@example.com',
      shouldPass: true,
    },
    {
      name: 'Complex 8+ character password (ComplexP@ssw0rd!2026)',
      password: 'ComplexP@ssw0rd!2026',
      email: 'test8a@example.com',
      shouldPass: true,
    },
    {
      name: '4 characters (abcd)',
      password: 'abcd',
      email: 'fail4a@example.com',
      shouldPass: false,
    },
    {
      name: '4 characters (1234)',
      password: '1234',
      email: 'fail4b@example.com',
      shouldPass: false,
    },
    {
      name: '1 character (a)',
      password: 'a',
      email: 'fail1a@example.com',
      shouldPass: false,
    },
    {
      name: 'Empty password ("")',
      password: '',
      email: 'failempty@example.com',
      shouldPass: false,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const res = await testRegister('Test User', tc.email, tc.password);
    const passedTest = tc.shouldPass ? res.ok : !res.ok;

    if (passedTest) {
      passed++;
      console.log(`  ✅ [PASS] ${tc.name} -> HTTP ${res.status}`);
    } else {
      failed++;
      console.log(`  ❌ [FAIL] ${tc.name} -> HTTP ${res.status}, Response:`, JSON.stringify(res.body));
    }
  }

  await mongoose.disconnect();
  await mongoServer.stop();

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${testCases.length} tests.`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 ALL PASSWORD REQUIREMENT TESTS PASSED SUCCESSFULLY!');
  }
}

runPasswordValidationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
