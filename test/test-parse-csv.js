const assert = require("assert");
const { parseCSV } = require("../core/ignore-method");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log("\n[parseCSV]");

test("selector with comma and comment", () => {
  const result = parseCSV("0xa9059cbb,transfer(address,uint256)");
  assert.strictEqual(result["0xa9059cbb"], "transfer(address,uint256)");
});

test("selector without comma (bug case: 0xedad400c)", () => {
  const result = parseCSV("0xedad400c");
  assert.ok("0xedad400c" in result, "selector phai duoc parse");
  assert.strictEqual(result["0xedad400c"], "");
});

test("selector with quoted comment", () => {
  const result = parseCSV('0x38ed1739,"swapExactTokensForTokens"');
  assert.strictEqual(result["0x38ed1739"], "swapExactTokensForTokens");
});

test("multiple lines mixed format", () => {
  const csv = [
    "0xedad400c",
    "0xa9059cbb,transfer(address,uint256)",
    "not-a-selector",
    "0x022c0d9f,",
  ].join("\n");
  const result = parseCSV(csv);
  assert.ok("0xedad400c" in result);
  assert.ok("0xa9059cbb" in result);
  assert.ok(!("not-a-selector" in result));
  assert.strictEqual(result["0x022c0d9f"], "");
});

test("case-insensitive selector", () => {
  const result = parseCSV("0xEDAD400C,someMethod");
  assert.ok("0xedad400c" in result);
});

test("empty input", () => {
  const result = parseCSV("");
  assert.deepStrictEqual(result, {});
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
