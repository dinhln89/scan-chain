const assert = require("assert");

const SYNC_TOPICS = new Set([
  "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1", // V2 Sync
  "0xcf2aa50876cdfbb541206f89af0ee78d44a2abf8d328e37fa4917f982149848a", // V3 Sync
]);
const SYNC_TOPIC_V2 = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";
const SYNC_TOPIC_V3 = "0xcf2aa50876cdfbb541206f89af0ee78d44a2abf8d328e37fa4917f982149848a";

// Giống hệt logic trong trace-tx-process.js — 2 tầng filter
function filterSync(swapPairBalanceOfs, logs, calls) {
  const syncEmitters = new Set(
    logs
      .filter((l) => SYNC_TOPICS.has(l.topics?.[0]?.toLowerCase()))
      .map((l) => l.address?.toLowerCase())
      .filter(Boolean),
  );
  // Tầng 1: token address emit Sync → là pair, không phải token
  for (const addr of syncEmitters) {
    swapPairBalanceOfs.delete(addr);
  }
  // Tầng 2: pair (c.wallet) emit Sync → token là reserve của swap, không cần discover
  for (const c of calls) {
    if (
      c.fn === "balanceOf(address)" &&
      c.wallet &&
      syncEmitters.has(c.wallet.toLowerCase()) &&
      c.to
    ) {
      swapPairBalanceOfs.delete(c.to.toLowerCase());
    }
  }
}

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

// Địa chỉ từ tx 0x3deeebe4... (BUSD case)
const BUSD    = "0xe9e7cea3dedca5984780bafc599bd69add087d56";
const PAIR_A  = "0x7efaef62fddcca950418312c6c91aef321375a00";
// Địa chỉ từ tx 0x1fd919a6... (AW/FIST case)
const AW      = "0x4b1aacd47bed1bd9f91935abe149dfd8b2777777";
const FIST    = "0xc9882def23bc42d53895b8361d0b1edc7570bc6a";
const PAIR_B  = "0xecbe29d11b2481dce9fcc8fe0db11fa5ec6ad637";
const TOKEN_X = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// --- Tầng 1: token địa chỉ emit Sync ---
console.log("\n[Tang 1: token emit Sync → la pair]");

test("token emit Sync → bi loai (BUSD case)", () => {
  const set = new Set([BUSD, TOKEN_X]);
  filterSync(set, [{ topics: [SYNC_TOPIC], address: BUSD }], []);
  assert.ok(!set.has(BUSD));
  assert.ok(set.has(TOKEN_X));
});

test("nhieu token emit Sync → tat ca bi loai", () => {
  const set = new Set([BUSD, PAIR_A, TOKEN_X]);
  filterSync(set, [
    { topics: [SYNC_TOPIC], address: BUSD },
    { topics: [SYNC_TOPIC], address: PAIR_A },
  ], []);
  assert.ok(!set.has(BUSD));
  assert.ok(!set.has(PAIR_A));
  assert.ok(set.has(TOKEN_X));
});

test("khong co Sync event → giu nguyen", () => {
  const set = new Set([BUSD, TOKEN_X]);
  filterSync(set, [
    { topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"], address: BUSD },
  ], []);
  assert.ok(set.has(BUSD));
  assert.ok(set.has(TOKEN_X));
});

test("log khong co topics → bo qua", () => {
  const set = new Set([BUSD]);
  filterSync(set, [
    { address: BUSD },
    { topics: [], address: BUSD },
    { topics: null, address: BUSD },
  ], []);
  assert.ok(set.has(BUSD));
});

test("V2 Sync topic case-insensitive", () => {
  const set = new Set([BUSD]);
  filterSync(set, [{ topics: [SYNC_TOPIC_V2.toUpperCase()], address: BUSD }], []);
  assert.ok(!set.has(BUSD));
});

test("V3 Sync topic → bi loai", () => {
  const set = new Set([BUSD, TOKEN_X]);
  filterSync(set, [{ topics: [SYNC_TOPIC_V3], address: BUSD }], []);
  assert.ok(!set.has(BUSD));
  assert.ok(set.has(TOKEN_X));
});

test("V3 pair emit Sync → filter tokens cua pair", () => {
  const set = new Set([AW, FIST, TOKEN_X]);
  filterSync(
    set,
    [{ topics: [SYNC_TOPIC_V3], address: PAIR_B }],
    [makeBalanceOfCall(AW, PAIR_B), makeBalanceOfCall(FIST, PAIR_B)],
  );
  assert.ok(!set.has(AW));
  assert.ok(!set.has(FIST));
  assert.ok(set.has(TOKEN_X));
});

// --- Tầng 2: pair (c.wallet) emit Sync → filter token của pair ---
console.log("\n[Tang 2: pair emit Sync → filter tokens trong pair (AW/FIST case)]");

const makeBalanceOfCall = (token, wallet) => ({
  fn: "balanceOf(address)",
  to: token,
  wallet,
});

test("pair emit Sync → token cua pair bi loai (AW)", () => {
  const set = new Set([AW, FIST, TOKEN_X]);
  filterSync(
    set,
    [{ topics: [SYNC_TOPIC], address: PAIR_B }],
    [makeBalanceOfCall(AW, PAIR_B), makeBalanceOfCall(FIST, PAIR_B)],
  );
  assert.ok(!set.has(AW), "AW phai bi loai");
  assert.ok(!set.has(FIST), "FIST phai bi loai");
  assert.ok(set.has(TOKEN_X), "TOKEN_X khong lien quan phai giu lai");
});

test("pair khong emit Sync → tokens giu nguyen", () => {
  const set = new Set([AW, FIST]);
  filterSync(
    set,
    [{ topics: ["0xother"], address: PAIR_B }],
    [makeBalanceOfCall(AW, PAIR_B), makeBalanceOfCall(FIST, PAIR_B)],
  );
  assert.ok(set.has(AW));
  assert.ok(set.has(FIST));
});

test("token trong pair khac emit Sync → khong anh huong", () => {
  const set = new Set([AW, TOKEN_X]);
  filterSync(
    set,
    [{ topics: [SYNC_TOPIC], address: PAIR_A }], // pair khac voi PAIR_B
    [makeBalanceOfCall(AW, PAIR_B)],              // AW thuoc PAIR_B
  );
  assert.ok(set.has(AW), "AW phai giu vi pair cua no (PAIR_B) khong emit Sync");
  assert.ok(set.has(TOKEN_X));
});

test("log rong → set giu nguyen", () => {
  const set = new Set([AW, FIST, TOKEN_X]);
  filterSync(set, [], [makeBalanceOfCall(AW, PAIR_B)]);
  assert.strictEqual(set.size, 3);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
