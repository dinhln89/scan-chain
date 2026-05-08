const { extractAddressesFromInput } = require("../core/trace");

const input = process.argv[2];
if (!input) {
  console.error("Usage: node terminal/test-extract-addresses.js <inputHex>");
  process.exit(1);
}

const addresses = extractAddressesFromInput(input);

console.log("Selector :", input.slice(0, 10));
console.log("Addresses:", addresses.length);
addresses.forEach((a, i) => console.log(`  [${i}] ${a}`));
