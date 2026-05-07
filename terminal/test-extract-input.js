const { extractAddressesFromInput, hasDumpData } = require("../core/trace");

const input = process.argv[2];
if (!input) {
  console.error("Usage: node terminal/test-extract-input.js <inputHex>");
  process.exit(1);
}

const hasDump = hasDumpData(input);

console.log("Selector:", input.slice(0, 10));
console.log("Has Dump Data:", hasDump);
// addresses.forEach((a, i) => console.log(`  [${i}] ${a}`));
