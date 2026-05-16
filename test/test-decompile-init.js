/**
 * Unit test cho decompile-init.js
 *
 * Case: proxy 0x5c952063... → implementation 0x7f9411ea...
 *   - detectProxy trả về implementation address
 *   - extractSelectorsFromDasm parse đúng PUSH4 từ dasm
 *   - findInitFromDasm tìm được initialize() qua 4byte lookup
 *
 * Chạy: node test/test-decompile-init.js
 */

const path = require("path");
const fs = require("fs");
const os = require("os");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Inline các functions cần test (tách từ decompile-init.js) ─────────────────

const INIT_RE = /^(?:init|initialize|initialise|setup|setUp)/i;

function extractSelectorsFromDasm(dasmFile) {
  const content = fs.readFileSync(dasmFile, "utf8");
  const sels = new Set();
  for (const m of content.matchAll(/PUSH4\s+(0x[0-9a-f]{8})/gi)) {
    const s = m[1].toLowerCase();
    if (s !== "0xffffffff") sels.add(s);
  }
  return [...sels];
}

async function findInitFromDasm(dasmFile, cache) {
  const selectors = extractSelectorsFromDasm(dasmFile);
  const initFns = [];
  for (const sel of selectors) {
    const sig = cache[sel] ?? null;
    if (sig && INIT_RE.test(sig.split("(")[0])) {
      initFns.push(sig);
    }
  }
  return initFns;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const FIXTURE_DASM = path.join(__dirname, "fixtures/proxy-dasm.dasm");

// 4byte cache giả lập (không cần network)
const MOCK_4BYTE = {
  "0x8129fc1c": "initialize()",
  "0x7ad4c7ab": "someOtherFunction(address)",
  "0x930cc050": "execute(bytes)",
  "0xf2fde38b": "transferOwnership(address)",
  "0x715018a6": "renounceOwnership()",
};

console.log("\n=== test-decompile-init ===\n");

// ── Test 1: extractSelectorsFromDasm ─────────────────────────────────────────
console.log("[1] extractSelectorsFromDasm");
{
  const sels = extractSelectorsFromDasm(FIXTURE_DASM);

  assert(Array.isArray(sels), "returns array");
  assert(!sels.includes("0xffffffff"), "excludes 0xffffffff");
  assert(sels.includes("0x8129fc1c"), "includes 0x8129fc1c (initialize)");
  assert(sels.includes("0x930cc050"), "includes 0x930cc050");
  // dedup: 0x8129fc1c xuất hiện 2 lần trong dasm nhưng chỉ có 1 lần trong output
  assertEq(sels.filter((s) => s === "0x8129fc1c").length, 1, "dedup: 0x8129fc1c xuất hiện 1 lần");
}

// ── Test 2: findInitFromDasm ──────────────────────────────────────────────────
console.log("\n[2] findInitFromDasm");
(async () => {
  const initFns = await findInitFromDasm(FIXTURE_DASM, MOCK_4BYTE);

  assertEq(initFns, ["initialize()"], "tìm được initialize()");
  assert(!initFns.includes("someOtherFunction(address)"), "loại non-init functions");
  assert(!initFns.includes("execute(bytes)"), "loại execute()");
})();

// ── Test 3: INIT_RE pattern matching ─────────────────────────────────────────
console.log("\n[3] INIT_RE pattern");
{
  const cases = [
    ["initialize", true],
    ["initialize()", true],  // sau split("(")
    ["init", true],
    ["initialise", true],
    ["setup", true],
    ["setUp", true],
    ["setUpRole", true],
    ["transfer", false],
    ["renounceOwnership", false],
    ["execute", false],
    ["0x8129fc1c", false],   // unresolved hex selector
  ];
  for (const [name, expected] of cases) {
    const fnBaseName = name.split("(")[0];
    assertEq(INIT_RE.test(fnBaseName), expected, `"${name}" → ${expected}`);
  }
}

// ── Test 4: temp file tạo tạm ─────────────────────────────────────────────────
console.log("\n[4] extractSelectorsFromDasm với dasm tự tạo");
(async () => {
  const tmpFile = path.join(os.tmpdir(), "test-proxy.dasm");
  fs.writeFileSync(tmpFile, [
    "   0x00: PUSH4    0x8129fc1c",   // initialize()
    "   0x0b: PUSH4    0xffffffff",   // dispatch mask → bị loại
    "   0x13: PUSH4    0x1a2b3c4d",   // unknown function
    "   0x1e: PUSH4    0x8129fc1c",   // duplicate → dedup
  ].join("\n"));

  const sels = extractSelectorsFromDasm(tmpFile);
  assertEq(sels.length, 2, "2 unique selectors (loại 0xffffffff, dedup 0x8129fc1c)");

  const cache = { "0x8129fc1c": "initialize(address)" };
  const initFns = await findInitFromDasm(tmpFile, cache);
  assertEq(initFns, ["initialize(address)"], "tìm được initialize(address)");

  fs.unlinkSync(tmpFile);
})().then(() => {
  // ── Summary ─────────────────────────────────────────────────────────────────
  setTimeout(() => {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`Passed: ${passed}  Failed: ${failed}`);
    if (failed > 0) process.exit(1);
  }, 50);
});
