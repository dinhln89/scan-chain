// Unit test cho owner-check detection trong analyzeFunctions
// Cases:
//   1. EQ  pattern: CALLER → EQ (constant slot)
//   2. SUB pattern: CALLER → SUB (constant slot)
//   3. Dynamic SLOAD: CALLER → SUB với MLOAD→SLOAD(var)
//   4. Negative: function không có owner check

const fs = require("fs");
const os = require("os");
const path = require("path");

// ── inline các hàm cần test (copy từ decompile-contract.js) ──────────────────

const ADDRESS_MASK = "ffffffffffffffffffffffffffffffffffffffff";

function buildTypeMap(tacContent) {
  const addressVars = new Set();
  const boolVars = new Set();
  const andRe = /^\S+: (\S+) = AND (.+)/;
  const varRe = /v([0-9a-fA-FVS]+)/g;
  for (const line of tacContent.split("\n")) {
    const m = andRe.exec(line.trim());
    if (!m) continue;
    const resultVar = m[1], operands = m[2];
    const hasAddr = operands.includes(ADDRESS_MASK);
    const hasBool = /\(0x1\)/.test(operands);
    if (!hasAddr && !hasBool) continue;
    if (hasAddr) addressVars.add(resultVar);
    if (hasBool) boolVars.add(resultVar);
    let vm; varRe.lastIndex = 0;
    while ((vm = varRe.exec(operands)) !== null) {
      if (hasAddr) addressVars.add(vm[1]);
      if (hasBool) boolVars.add(vm[1]);
    }
  }
  return { addressVars, boolVars };
}

function detectOwnerSlot(block) {
  const callerVars = new Set(
    [...block.matchAll(/: (\S+) = CALLER/g)].map((m) => m[1])
  );
  if (callerVars.size === 0) return null;

  const localSload = new Map();
  const localSloadVars = new Set();
  const localAndFrom = new Map();

  for (const line of block.split("\n")) {
    let m = line.match(/:\s+(\S+) = SLOAD \S+\((0x[0-9a-f]+)\)/);
    if (m) { localSload.set(m[1], m[2]); localSloadVars.add(m[1]); continue; }
    m = line.match(/:\s+(\S+) = SLOAD (\S+)$/);
    if (m) { localSloadVars.add(m[1]); continue; }
    m = line.match(/:\s+(\S+) = AND (\S+)\([^)]+\), (\S+)$/) ||
        line.match(/:\s+(\S+) = AND (\S+), (\S+)\([^)]+\)$/);
    if (m) localAndFrom.set(m[1], m[3] || m[2]);
  }

  const traceSlot = (v, d = 0) => {
    if (d > 8) return null;
    if (localSload.has(v)) return localSload.get(v);
    if (localSloadVars.has(v)) return "?";
    if (localAndFrom.has(v)) return traceSlot(localAndFrom.get(v), d + 1);
    return null;
  };

  const ownerCheckRe = /: (\S+) = (?:EQ|SUB) (\S+), (\S+)/g;
  for (const m of block.matchAll(ownerCheckRe)) {
    const [, , op1, op2] = m;
    for (const op of [op1, op2]) {
      if (callerVars.has(op)) continue;
      const s = traceSlot(op);
      if (s !== null) return s;
    }
  }
  return null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── TAC fixtures ─────────────────────────────────────────────────────────────

// Case 1: EQ pattern, constant storage slot 0x1
const TAC_EQ_CONSTANT = `
function setGov() public {
    Begin block 0x60a
    0x60b: v60b = CALLVALUE
    0x60d: v60d = ISZERO v60b
    0x10a: v10a(0x1) = CONST
    0x10b: v10b = SLOAD v10a(0x1)
    0x10c: v10c(0xffffffffffffffffffffffffffffffffffffffff) = SUB v_big(0x10000000000000000000000000000000000000000), v_one(0x1)
    0x10d: v10d = AND v10c(0xffffffffffffffffffffffffffffffffffffffff), v10b
    0x10e: v10e = CALLER
    0x10f: v10f = EQ v10e, v10d
    0x110: JUMPI v_revert, v10f
    0x111: SSTORE v_slot, v_val
}
`;

// Case 2: SUB pattern, constant storage slot 0x2
const TAC_SUB_CONSTANT = `
function transferOwnership() public {
    Begin block 0x49c
    0x10a: v10a(0x2) = CONST
    0x10b: v10b = SLOAD v10a(0x2)
    0x10c: v10c(0xffffffffffffffffffffffffffffffffffffffff) = SUB v_big(0x10000000000000000000000000000000000000000), v_one(0x1)
    0x10d: v10d = AND v10c(0xffffffffffffffffffffffffffffffffffffffff), v10b
    0x10e: v10e = CALLER
    0x10f: v10f = SUB v10e, v10d
    0x110: JUMPI v_revert, v10f
    0x111: SSTORE v_slot, v_val
}
`;

// Case 3: Dynamic SLOAD — slot từ MLOAD (như renounceOwnership thực tế)
const TAC_SUB_DYNAMIC_SLOAD = `
function renounceOwnership() public {
    Begin block 0x49c
    0x116c: v116c = MLOAD v116b(0x0)
    0x1179: v1179 = SLOAD v116c
    0x117c: v117c(0xffffffffffffffffffffffffffffffffffffffff) = SUB v_big(0x10000000000000000000000000000000000000000), v_one(0x1)
    0x1182: v1182 = AND v117c(0xffffffffffffffffffffffffffffffffffffffff), v1179
    0x1183: v1183 = CALLER
    0x1184: v1184 = SUB v1183, v1182
    0x1185: JUMPI v_revert, v1184
    0x1186: SSTORE v_slot, v_zero
}
`;

// Case 4: Negative — không có owner check
const TAC_NO_OWNER_CHECK = `
function claim() public {
    Begin block 0x43f
    0x440: v440 = CALLVALUE
    0x441: v441 = ISZERO v440
    0x442: v442 = SLOAD v_slot(0x5)
    0x443: v443 = ADD v442, v_one
    0x444: SSTORE v_slot(0x5), v443
}
`;

// ── run tests ─────────────────────────────────────────────────────────────────

console.log("\nCase 1: EQ pattern (constant slot 0x1)");
assert("ownerSlot = 0x1", detectOwnerSlot(TAC_EQ_CONSTANT), "0x1");

console.log("\nCase 2: SUB pattern (constant slot 0x2)");
assert("ownerSlot = 0x2", detectOwnerSlot(TAC_SUB_CONSTANT), "0x2");

console.log("\nCase 3: Dynamic SLOAD (MLOAD→SLOAD)");
assert("ownerSlot = ?", detectOwnerSlot(TAC_SUB_DYNAMIC_SLOAD), "?");

console.log("\nCase 4: No owner check");
assert("ownerSlot = null", detectOwnerSlot(TAC_NO_OWNER_CHECK), null);

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Passed: ${passed} / ${passed + failed}`);
if (failed > 0) process.exit(1);
