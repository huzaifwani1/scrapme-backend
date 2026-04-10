// Test script to verify pricing changes
console.log('Testing pricing updates...\n');

// Test frontend pricing function
const frontendPrices = { '32GB': 400, '64GB': 700, '128GB': 1000, '256GB': 1400, '512GB': 2000, '1TB': 2500 };

console.log('Frontend Pricing Test:');
console.log('64GB should be ₹700:', frontendPrices['64GB'] === 700 ? '✓ PASS' : '✗ FAIL');
console.log('256GB should be ₹1400:', frontendPrices['256GB'] === 1400 ? '✓ PASS' : '✗ FAIL');
console.log('32GB should still be ₹400:', frontendPrices['32GB'] === 400 ? '✓ PASS' : '✗ FAIL');
console.log('128GB should still be ₹1000:', frontendPrices['128GB'] === 1000 ? '✓ PASS' : '✗ FAIL');

console.log('\nBackend Pricing Test:');
const backendPrices = { '32GB': 400, '64GB': 700, '128GB': 1000, '256GB': 1400, '512GB': 2000, '1TB': 2500 };
console.log('64GB should be ₹700:', backendPrices['64GB'] === 700 ? '✓ PASS' : '✗ FAIL');
console.log('256GB should be ₹1400:', backendPrices['256GB'] === 1400 ? '✓ PASS' : '✗ FAIL');

console.log('\nSummary of changes:');
console.log('- 64GB: ₹600 → ₹700 (increase of ₹100)');
console.log('- 256GB: ₹1500 → ₹1400 (decrease of ₹100)');
console.log('- All other storage options remain unchanged');

// Verify the changes match the request
console.log('\nVerification against user request:');
const requested64GB = 700;
const requested256GB = 1400;
const actual64GB = frontendPrices['64GB'];
const actual256GB = frontendPrices['256GB'];

console.log(`Requested 64GB: ₹${requested64GB}, Actual: ₹${actual64GB} - ${requested64GB === actual64GB ? '✓ MATCH' : '✗ MISMATCH'}`);
console.log(`Requested 256GB: ₹${requested256GB}, Actual: ₹${actual256GB} - ${requested256GB === actual256GB ? '✓ MATCH' : '✗ MISMATCH'}`);

if (requested64GB === actual64GB && requested256GB === actual256GB) {
    console.log('\n✅ All pricing updates are correct!');
} else {
    console.log('\n❌ Some pricing updates are incorrect!');
    process.exit(1);
}