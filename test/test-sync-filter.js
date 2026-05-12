const assert = require("assert");

// Logic filter Sync event — giống hệt trong trace-tx-process.js
const SYNC_TOPIC = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";

function filterSyncEmitters(swapPairBalanceOfs, logs) {
  const syncEmitters = new Set(
    logs
      .filter((l) => l.topics?.[0]?.toLowerCase() === SYNC_TOPIC)
      .map((l) => l.address?.toLowerCase())
      .filter(Boolean),
  );
  for (const addr of syncEmitters) {
    swapPairBalanceOfs.delete(addr);
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

// Địa chỉ từ tx 0x3deeebe4f52052e6235ff3bd0a51d408d2ad8a6ca4264e923ed2be882e4d6d49
const BUSD    = "0xe9e7cea3dedca5984780bafc599bd69add087d56";
const PAIR    = "0x7efaef62fddcca950418312c6c91aef321375a00";
const TOKEN_X = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // token hợp lệ (không emit Sync)

console.log("\n[Sync event filter]");

test("pair emit Sync → bị loại khỏi swapPairBalanceOfs", () => {
  const set = new Set([BUSD, TOKEN_X]);
  const logs = [
    { topics: [SYNC_TOPIC], address: BUSD },
  ];
  filterSyncEmitters(set, logs);
  assert.ok(!set.has(BUSD), "BUSD phai bi loai");
  assert.ok(set.has(TOKEN_X), "TOKEN_X phai giu lai");
});

test("nhieu pair emit Sync → tat ca bi loai", () => {
  const set = new Set([BUSD, PAIR, TOKEN_X]);
  const logs = [
    { topics: [SYNC_TOPIC], address: BUSD },
    { topics: [SYNC_TOPIC], address: PAIR },
  ];
  filterSyncEmitters(set, logs);
  assert.ok(!set.has(BUSD));
  assert.ok(!set.has(PAIR));
  assert.ok(set.has(TOKEN_X));
});

test("khong co Sync event → khong loai gi", () => {
  const set = new Set([BUSD, TOKEN_X]);
  const logs = [
    { topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"], address: BUSD },
  ];
  filterSyncEmitters(set, logs);
  assert.ok(set.has(BUSD), "BUSD phai giu lai khi khong co Sync");
  assert.ok(set.has(TOKEN_X));
});

test("log khong co topics → bo qua", () => {
  const set = new Set([BUSD]);
  const logs = [
    { address: BUSD },
    { topics: [], address: BUSD },
    { topics: null, address: BUSD },
  ];
  filterSyncEmitters(set, logs);
  assert.ok(set.has(BUSD), "BUSD phai giu lai khi topics khong hop le");
});

test("Sync topic case-insensitive", () => {
  const set = new Set([BUSD]);
  const logs = [
    { topics: [SYNC_TOPIC.toUpperCase()], address: BUSD },
  ];
  filterSyncEmitters(set, logs);
  assert.ok(!set.has(BUSD), "BUSD phai bi loai du topic la uppercase");
});

test("log rong → set giu nguyen", () => {
  const set = new Set([BUSD, TOKEN_X]);
  filterSyncEmitters(set, []);
  assert.strictEqual(set.size, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
