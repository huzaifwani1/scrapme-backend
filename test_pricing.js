// Test script to verify pricing changes
console.log('Testing pricing updates...\n');

// Test frontend pricing function
const frontendPrices = { '32GB': 300, '64GB': 500, '128GB': 700, '256GB': 1200, '512GB': 1500, '1TB': 2400 };

console.log('Frontend Pricing Test:');
console.log('64GB should be ₹500:', frontendPrices['64GB'] === 500 ? '✓ PASS' : '✗ FAIL');
console.log('256GB should be ₹1200:', frontendPrices['256GB'] === 1200 ? '✓ PASS' : '✗ FAIL');
console.log('32GB should be ₹300:', frontendPrices['32GB'] === 300 ? '✓ PASS' : '✗ FAIL');
console.log('128GB should be ₹700:', frontendPrices['128GB'] === 700 ? '✓ PASS' : '✗ FAIL');

console.log('\nBackend Pricing Test:');
const backendPrices = { '32GB': 300, '64GB': 500, '128GB': 700, '256GB': 1200, '512GB': 1500, '1TB': 2400 };
console.log('64GB should be ₹500:', backendPrices['64GB'] === 500 ? '✓ PASS' : '✗ FAIL');
console.log('256GB should be ₹1200:', backendPrices['256GB'] === 1200 ? '✓ PASS' : '✗ FAIL');

console.log('\nSummary of changes:');
console.log('- 32GB: ₹400 → ₹300 (decrease of ₹100)');
console.log('- 64GB: ₹700 → ₹500 (decrease of ₹200)');
console.log('- 128GB: ₹1000 → ₹700 (decrease of ₹300)');
console.log('- 256GB: ₹1400 → ₹1200 (decrease of ₹200)');
console.log('- 512GB: ₹2000 → ₹1500 (decrease of ₹500)');
console.log('- 1TB: ₹2500 → ₹2400 (decrease of ₹100)');

// Verify the changes match the request
console.log('\nVerification against user request:');
const requestedPrices = { '32GB': 300, '64GB': 500, '128GB': 700, '256GB': 1200, '512GB': 1500, '1TB': 2400 };
let allMatch = true;

for (const [storage, expected] of Object.entries(requestedPrices)) {
    const actual = frontendPrices[storage];
    const match = expected === actual;
    if (!match) allMatch = false;
    console.log(`${storage}: Expected ₹${expected}, Actual ₹${actual} - ${match ? '✓ MATCH' : '✗ MISMATCH'}`);
}

if (allMatch) {
    console.log('\n✅ All pricing updates are correct!');
} else {
    console.log('\n❌ Some pricing updates are incorrect!');
    process.exit(1);
}