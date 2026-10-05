// Comprehensive test runner for Frontend_App
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const testsDir = path.join(__dirname, '__tests__');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.js')).sort();

let totalPassed = 0;
let totalFailed = 0;

console.log(`=== Running All ${files.length} Frontend Test Suites ===\n`);

files.forEach(f => {
  console.log(`\n========================================`);
  console.log(`Running: ${f}`);
  console.log(`========================================`);
  try {
    cp.execSync(`node "${path.join(testsDir, f)}"`, { stdio: 'inherit' });
    totalPassed++;
  } catch (err) {
    console.error(`FAILED: ${f}`);
    totalFailed++;
  }
});

console.log(`\n========================================`);
console.log(`Frontend Test Summary: ${totalPassed} suites passed, ${totalFailed} suites failed.`);
console.log(`========================================\n`);

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
