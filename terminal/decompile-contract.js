require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");
const { rpc } = require("../core/trace");

const DECOMPILE_DIR = path.resolve(__dirname, "../decompile");
const TEMP_DIR = path.resolve(__dirname, "../.temp");
const GIGAHORSE = path.resolve(process.env.HOME, ".gigahorse/bin/gigahorse");
const TIMEOUT = process.env.DECOMPILE_TIMEOUT || 600;
const BSC_CHAIN_ID = 56;
const FOURBYTE_CACHE_FILE = path.resolve(__dirname, "../data/4byte-cache.json");

const SHOW_SOURCE = process.argv.includes("--source");
const SKIP_SOURCIFY = process.argv.includes("--no-sourcify");

// --- 4byte cache ---
let _4byteCache = null;
function load4byteCache() {
  if (_4byteCache) return _4byteCache;
  try {
    _4byteCache = JSON.parse(fs.readFileSync(FOURBYTE_CACHE_FILE, "utf8"));
  } catch {
    _4byteCache = {};
  }
  return _4byteCache;
}
function save4byteCache() {
  fs.mkdirSync(path.dirname(FOURBYTE_CACHE_FILE), { recursive: true });
  fs.writeFileSync(FOURBYTE_CACHE_FILE, JSON.stringify(_4byteCache, null, 2));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

// Lazy-load FourByteSelector model (DB có thể không kết nối được)
let _FourByteSelector = null;
async function getFourByteSelectorModel() {
  if (_FourByteSelector) return _FourByteSelector;
  try {
    const sequelize = require("../db");
    await sequelize.ensureDatabase();
    _FourByteSelector = require("../models/FourByteSelector");
    await _FourByteSelector.sync();
  } catch {
    _FourByteSelector = null;
  }
  return _FourByteSelector;
}

// Tra cứu tên function: DB → JSON cache → 4byte.directory API
async function lookup4byte(selector) {
  // 1. Thử DB
  const model = await getFourByteSelectorModel();
  if (model) {
    try {
      const row = await model.findByPk(selector);
      if (row) return row.signature;
    } catch {}
  }

  // 2. Thử JSON cache
  const cache = load4byteCache();
  if (selector in cache) return cache[selector];

  // 3. Hit 4byte.directory API
  const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}`;
  let result = null;
  try {
    const { status, body } = await httpsGet(url);
    if (status === 200) {
      const { results } = JSON.parse(body);
      if (results && results.length > 0) {
        results.sort((a, b) => a.id - b.id);
        result = results[0].text_signature;
      }
    }
  } catch {}

  if (result !== null) {
    // Lưu vào DB và JSON cache
    if (model) {
      try { await model.upsert({ selector, signature: result }); } catch {}
    }
    cache[selector] = result;
    save4byteCache();
  }
  return result;
}

async function fetchSourcify(address) {
  const url = `https://sourcify.dev/server/files/any/${BSC_CHAIN_ID}/0x${address.replace("0x", "")}`;
  try {
    const { status, body } = await httpsGet(url);
    if (status !== 200) return null;
    const { files } = JSON.parse(body);
    return files.filter((f) => f.name.endsWith(".sol"));
  } catch {
    return null;
  }
}

// Đọc CSV tab-separated thành array of arrays
function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").trim().split("\n")
    .filter(Boolean)
    .map((l) => l.split("\t"));
}

const ADDRESS_MASK = "ffffffffffffffffffffffffffffffffffffffff";

// Phân tích TAC để build set các variable đã biết type từ AND operations
function buildTypeMap(tacFile) {
  const addressVars = new Set();
  const boolVars = new Set();
  if (!fs.existsSync(tacFile)) return { addressVars, boolVars };

  const andRe = /^\S+: (\S+) = AND (.+)/;
  const varRe = /v([0-9a-fA-FVS]+)/g;

  for (const line of fs.readFileSync(tacFile, "utf8").split("\n")) {
    const m = andRe.exec(line.trim());
    if (!m) continue;
    const resultVar = m[1];
    const operands = m[2];
    const hasAddrMask = operands.includes(ADDRESS_MASK);
    const hasBoolMask = /\(0x1\)/.test(operands);
    if (!hasAddrMask && !hasBoolMask) continue;

    // Result var của AND là address/bool value
    if (hasAddrMask) addressVars.add(resultVar);
    if (hasBoolMask) boolVars.add(resultVar);

    // Operand vars cũng là address/bool (input)
    let vm;
    varRe.lastIndex = 0;
    while ((vm = varRe.exec(operands)) !== null) {
      const v = vm[1];
      if (hasAddrMask) addressVars.add(v);
      if (hasBoolMask) boolVars.add(v);
    }
  }
  return { addressVars, boolVars };
}

function inferType(varName, addressVars, boolVars, tacDefs) {
  if (addressVars.has(varName)) return "address";
  if (boolVars.has(varName)) return "bool";
  const base = varName.split("V")[0].replace(/^0x/, "");
  if (addressVars.has(base) || addressVars.has("v" + base)) return "address";
  if (boolVars.has(base) || boolVars.has("v" + base)) return "bool";
  const defn = tacDefs && (tacDefs.get(varName) || tacDefs.get("v" + base));
  if (defn) {
    const [op, operands] = defn;
    if (op === "ISZERO") return "bool";
    if (op === "AND") {
      for (const o of operands) {
        const vm = o.match(/\(([0-9a-fx]+)\)/i);
        if (vm) {
          if (ADDRESS_MASK.includes(vm[1].toLowerCase().replace("0x", ""))) return "address";
          if (vm[1] === "0x1") return "bool";
        }
      }
    }
  }
  return "uint256";
}

// Phân tích TAC: payability và return type cho mỗi public function
function analyzeFunctions(tacFile, addressVars, boolVars) {
  const result = new Map(); // funcName -> { payable, retType }
  if (!fs.existsSync(tacFile)) return result;

  const tac = fs.readFileSync(tacFile, "utf8");

  // Build tac defs map
  const tacDefs = new Map();
  for (const line of tac.split("\n")) {
    const m = line.trim().match(/^\S+: (\S+) = (\w+)\s*(.*)/);
    if (m) {
      const [, varName, op, rest] = m;
      const operands = rest ? rest.split(",").map((s) => s.trim()) : [];
      tacDefs.set(varName, [op, operands]);
    }
  }

  // Split theo functions
  const fnBlocks = tac.split(/^(?=function )/m);
  for (const block of fnBlocks) {
    if (!block.startsWith("function ")) continue;

    // Lấy block address từ "Begin block 0xXXX" đầu tiên — dùng làm key
    const blockAddrMatch = block.match(/Begin block (0x[0-9a-f]+)/);
    if (!blockAddrMatch) continue;
    const blockAddr = blockAddrMatch[1];

    // Payable: không có CALLVALUE → ISZERO pattern
    const isPayable = !(/= CALLVALUE\s*\n\s*\S+: \S+ = ISZERO/.test(block));

    // Return type: trace MSTORE values gần RETURN
    let retType = null;
    if (/\bRETURN\b/.test(block)) {
      const mstores = [...block.matchAll(/MSTORE (\S+),\s*(v\S+)/g)];
      if (mstores.length > 0) {
        const storedVar = mstores[mstores.length - 1][2];
        const t = inferType(storedVar, addressVars, boolVars, tacDefs);
        retType = t;
      }
    }

    const mutating = block.includes(" SSTORE ");

    // Detect initializer: SLOAD slot → check == 0 → SSTORE same slot = 1
    let isInitializer = false;
    {
      // Map: slotConst -> loaded var
      const slotLoaded = new Map();
      for (const m of block.matchAll(/:\s+(\S+) = SLOAD \S+\((0x[0-9a-f]+)\)/g))
        slotLoaded.set(m[2], m[1]);

      // Vars kiểm tra == 0 (ISZERO hoặc EQ với 0)
      const checkedZero = new Set();
      for (const m of block.matchAll(/:\s+(\S+) = ISZERO (\S+)/g))
        checkedZero.add(m[2]);
      for (const m of block.matchAll(/:\s+(\S+) = EQ (\S+), \S+\(0x0\)/g))
        checkedZero.add(m[2]);
      for (const m of block.matchAll(/:\s+(\S+) = EQ \S+\(0x0\), (\S+)/g))
        checkedZero.add(m[2]);

      // Slots được SSTORE với giá trị nhỏ (0x1 hoặc 0x2 — initialized flag)
      const storedOne = new Set();
      for (const m of block.matchAll(/SSTORE \S+\((0x[0-9a-f]+)\), \S+\(0x[12]\)/g))
        storedOne.add(m[1]);

      // Nếu slot vừa được check==0 vừa được set=1 → initializer
      for (const [slot, loadedVar] of slotLoaded) {
        if (checkedZero.has(loadedVar) && storedOne.has(slot)) {
          isInitializer = true;
          break;
        }
      }
    }

    // Detect owner-check: CALLER → EQ pattern
    const callerVars = new Set([...block.matchAll(/: (\S+) = CALLER/g)].map((m) => m[1]));
    let ownerSlot = null;
    if (callerVars.size > 0) {
      // Build local maps từ block
      const localSload = new Map();  // var -> constant slot (nếu có)
      const localSloadVars = new Set(); // tất cả kết quả SLOAD (kể cả dynamic slot)
      const localAndFrom = new Map();
      for (const line of block.split("\n")) {
        // SLOAD với constant slot: SLOAD vX(0x1)
        let m = line.match(/:\s+(\S+) = SLOAD \S+\((0x[0-9a-f]+)\)/);
        if (m) { localSload.set(m[1], m[2]); localSloadVars.add(m[1]); }
        // SLOAD với dynamic slot: SLOAD vX
        else { m = line.match(/:\s+(\S+) = SLOAD (\S+)$/); if (m) localSloadVars.add(m[1]); }
        // AND operations
        m = line.match(/:\s+(\S+) = AND (\S+)\([^)]+\), (\S+)$/) ||
            line.match(/:\s+(\S+) = AND (\S+), (\S+)\([^)]+\)$/);
        if (m) localAndFrom.set(m[1], m[3] || m[2]);
      }
      const traceSlot = (v, d = 0) => {
        if (d > 8) return null;
        if (localSload.has(v)) return localSload.get(v);    // slot constant
        if (localSloadVars.has(v)) return "?";              // SLOAD dynamic slot
        if (localAndFrom.has(v)) return traceSlot(localAndFrom.get(v), d + 1);
        return null;
      };
      // Detect cả EQ và SUB(CALLER, owner) pattern
      const ownerCheckRe = /: (\S+) = (?:EQ|SUB) (\S+), (\S+)/g;
      for (const m of block.matchAll(ownerCheckRe)) {
        const [, , op1, op2] = m;
        for (const op of [op1, op2]) {
          if (callerVars.has(op)) continue;
          const s = traceSlot(op);
          if (s) { ownerSlot = s; break; }
        }
        if (ownerSlot) break;
      }
    }

    result.set(blockAddr, { payable: isPayable, retType, mutating, ownerSlot, isInitializer });
  }
  return result;
}

// Parse contract.tac thành map: functionEntry -> { signature, blocks: string }
function parseTac(tacFile) {
  const content = fs.readFileSync(tacFile, "utf8");
  const functions = [];
  // Tách theo "function " ở đầu dòng
  const parts = content.split(/^(?=function )/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const firstLine = part.split("\n")[0].trim();
    functions.push({ header: firstLine, body: part.trim() });
  }
  return functions;
}

// Build pseudo-Solidity từ gigahorse output
async function buildPseudoSolidity(outDir, address) {
  const namesFile = path.join(outDir, "HighLevelFunctionName.csv");
  const callSigsFile = path.join(outDir, "CallToSignature.csv");
  const publicFnFile = path.join(outDir, "PublicFunction.csv");
  const tacFile = path.join(outDir, "contract.tac");
  const eventFile = path.join(outDir, "EventSignatureInContract.csv");
  const constSigFile = path.join(outDir, "ConstantPossibleSigHash.csv");

  const lines = [];
  lines.push(`// Decompiled by gigahorse (interpreted mode)`);
  lines.push(`// Contract: ${address}`);
  lines.push("");

  // External calls detected
  const callSigs = readCsv(callSigsFile);
  if (callSigs.length > 0) {
    lines.push("// External calls detected:");
    const unique = [...new Set(callSigs.map((r) => r[1]).filter(Boolean))].sort();
    unique.forEach((s) => lines.push(`//   interface { function ${s}; }`));
    lines.push("");
  }

  // Events
  const events = readCsv(eventFile);
  if (events.length > 0) {
    events.forEach(([, sig]) => sig && lines.push(`event ${sig};`));
    lines.push("");
  }

  // Public functions summary
  const names = readCsv(namesFile);
  const pubFns = readCsv(publicFnFile);
  const pubArgs = readCsv(path.join(outDir, "PublicFunctionArg.csv"));
  const blockToName = new Map(names.map(([block, name]) => [block, name]));

  // Build arg map: block -> sorted list of varNames by index
  const blockToArgs = new Map();
  for (const [block, varName, idx] of pubArgs) {
    if (!blockToArgs.has(block)) blockToArgs.set(block, []);
    blockToArgs.get(block)[parseInt(idx)] = varName;
  }

  // Build type map from TAC
  const { addressVars, boolVars } = buildTypeMap(tacFile);
  const fnAnalysis = analyzeFunctions(tacFile, addressVars, boolVars);

  // pubFns: [block, selector] — tất cả public functions từ gigahorse
  // Lookup 4byte cho các selector chưa resolve
  const resolvedNames = new Map();
  const unresolvedSelectors = [];
  for (const [block, selector] of pubFns) {
    const name = blockToName.get(block) || selector;
    if (name === "__function_selector__") continue;
    const isResolved = name.includes("(") && !/^0x[0-9a-f]+$/.test(name);
    if (isResolved) {
      resolvedNames.set(block, name);
    } else {
      unresolvedSelectors.push({ block, selector });
    }
  }

  // Batch lookup 4byte cho unresolved, fallback sang infer từ TAC
  for (const item of unresolvedSelectors) {
    const found = await lookup4byte(item.selector);
    if (found) {
      resolvedNames.set(item.block, found);
    } else {
      // Infer params từ TAC
      const argVars = blockToArgs.get(item.block) || [];
      const params = argVars.map((v) => inferType(v, addressVars, boolVars));
      const sig = `${item.selector}(${params.join(", ")})`;
      resolvedNames.set(item.block, sig);
    }
  }

  // Collect, phân nhóm mutating vs view, sort asc
  const mutatingList = [];
  const viewList = [];

  for (const [block] of pubFns) {
    if ((blockToName.get(block) || "") === "__function_selector__") continue;
    const name = resolvedNames.get(block);
    if (!name) continue;
    const analysis = fnAnalysis.get(block) || {};
    const payable = analysis.payable ? " payable" : "";
    const ret = analysis.retType ? ` returns (${analysis.retType})` : "";
    const sig = `external${payable} ${name}${ret}`;
    if (analysis.mutating) mutatingList.push(sig);
    else viewList.push(sig);
  }
  mutatingList.sort((a, b) => a.localeCompare(b));
  viewList.sort((a, b) => a.localeCompare(b));

  // Helper: slot → label
  const slotLabel = (s) => s ? `storage[${s}]` : "unknown";

  const INIT_NAME_RE = /^(?:init|initialize|initialise|setup|setUp)[\W_]?/i;

  // Group by ownerSlot, initializer, mutating, view
  const ownerGroups = new Map(); // slot -> [sig]
  const initList = [];
  const nonOwnerMutating = [];
  const nonOwnerView = [];

  for (const [block] of pubFns) {
    if ((blockToName.get(block) || "") === "__function_selector__") continue;
    const name = resolvedNames.get(block);
    if (!name) continue;
    const analysis = fnAnalysis.get(block) || {};
    const payable = analysis.payable ? " payable" : "";
    const ret = analysis.retType ? ` returns (${analysis.retType})` : "";
    const sig = `external${payable} ${name}${ret}`;

    // Detect initializer: by pattern hoặc by tên
    const fnBaseName = name.split("(")[0];
    const isInit = analysis.isInitializer || INIT_NAME_RE.test(fnBaseName);

    if (isInit) {
      initList.push(sig);
    } else if (analysis.ownerSlot) {
      if (!ownerGroups.has(analysis.ownerSlot)) ownerGroups.set(analysis.ownerSlot, []);
      ownerGroups.get(analysis.ownerSlot).push(sig);
    } else if (analysis.mutating) {
      nonOwnerMutating.push(sig);
    } else {
      nonOwnerView.push(sig);
    }
  }

  // Sort tất cả
  for (const list of [...ownerGroups.values(), initList, nonOwnerMutating, nonOwnerView]) {
    list.sort((a, b) => a.localeCompare(b));
  }

  // Initializers
  if (initList.length > 0) {
    lines.push(`// One-time init (${initList.length}):`);
    initList.forEach((sig) => lines.push(`// function ${sig}`));
    lines.push("");
  }

  // Access-controlled groups
  for (const [slot, list] of [...ownerGroups.entries()].sort()) {
    lines.push(`// Access-controlled [require(msg.sender == ${slotLabel(slot)})] (${list.length}):`);
    list.forEach((sig) => lines.push(`// function ${sig}`));
    lines.push("");
  }

  lines.push(`// State-changing / no access check (${nonOwnerMutating.length}):`);
  nonOwnerMutating.forEach((sig) => lines.push(`// function ${sig}`));
  lines.push("");
  lines.push(`// View / no storage write (${nonOwnerView.length}):`);
  nonOwnerView.forEach((sig) => lines.push(`// function ${sig}`));
  lines.push("");

  // TAC functions
  if (!SHOW_SOURCE) {
    lines.push(`// Full decompiled TAC: ${tacFile}`);
    lines.push("// Pass --source to show function bodies");
    return lines.join("\n");
  }

  lines.push("// ============================================================");
  lines.push("// DECOMPILED TAC (Three-Address Code)");
  lines.push("// ============================================================");
  lines.push("");

  const fns = parseTac(tacFile);
  for (const fn of fns) {
    lines.push(fn.body);
    lines.push("");
  }

  return lines.join("\n");
}

// Detect proxy và trả về implementation address nếu có
async function detectProxy(address) {
  const EIP1967_IMPL   = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const EIP1967_BEACON = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
  const EIP1822        = "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7";

  const toAddr = (slot) => {
    const v = slot?.slice(-40);
    return v && v !== "0".repeat(40) ? "0x" + v : null;
  };

  try {
    const [impl, beacon, uups] = await Promise.all([
      rpc("eth_getStorageAt", [address, EIP1967_IMPL, "latest"]),
      rpc("eth_getStorageAt", [address, EIP1967_BEACON, "latest"]),
      rpc("eth_getStorageAt", [address, EIP1822, "latest"]),
    ]);
    const implAddr = toAddr(impl);
    if (implAddr) return { type: "EIP-1967", impl: implAddr };
    const beaconAddr = toAddr(beacon);
    if (beaconAddr) return { type: "EIP-1967 Beacon", impl: beaconAddr };
    const uupsAddr = toAddr(uups);
    if (uupsAddr) return { type: "EIP-1822 UUPS", impl: uupsAddr };
  } catch {}
  return null;
}

async function decompileContract(address) {
  address = address.toLowerCase();
  const name = `contract_${address.slice(2, 10)}`;
  const hexFile = path.join(DECOMPILE_DIR, `${name}.hex`);
  const outDir = path.join(TEMP_DIR, name, "out");
  const tacFile = path.join(outDir, "contract.tac");
  const solFile = path.join(TEMP_DIR, `${name}.sol`);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Contract: ${address}`);
  console.log("=".repeat(60));

  // --- Proxy detection ---
  process.stdout.write("Proxy check... ");
  const proxy = await detectProxy(address);
  if (proxy) {
    console.log(`${proxy.type} -> ${proxy.impl}`);
    console.log(`Decompiling implementation instead...\n`);
    return decompileContract(proxy.impl);
  }
  console.log("không phải proxy.");

  // --- Sourcify ---
  process.stdout.write("Tìm verified source (Sourcify)... ");
  const solFiles = SKIP_SOURCIFY ? null : await fetchSourcify(address);
  if (!SKIP_SOURCIFY && solFiles && solFiles.length > 0) {
    console.log(`Có! (${solFiles.length} files)`);
    // Lấy toàn bộ function signature đến trước { hoặc ;
    const fnRe = /^\s+function\s+(.+?)(?:\s*\{|;)\s*$/gm;
    const mutatingKw = /\b(?:pure|view)\b/;
    const initRe = /^(?:init|initialize|initialise|setup|setUp)/i;

    const mutList = [], viewList = [], initFnList = [];

    for (const f of solFiles) {
      const dest = path.join(TEMP_DIR, name, f.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.content);

      // Parse function signatures
      let m;
      fnRe.lastIndex = 0;
      while ((m = fnRe.exec(f.content)) !== null) {
        const sig = m[1].trim().replace(/\s+/g, " ");
        const fnName = sig.match(/^(\w+)/)?.[1] || "";
        if (initRe.test(fnName)) initFnList.push(sig);
        else if (mutatingKw.test(sig)) viewList.push(sig);
        else mutList.push(sig);
      }

      if (SHOW_SOURCE) {
        console.log(`\n// ${f.name}\n${"─".repeat(60)}`);
        console.log(f.content);
      }
    }

    [initFnList, mutList, viewList].forEach((l) => l.sort((a, b) => a.localeCompare(b)));

    if (initFnList.length) {
      console.log(`\n// One-time init (${initFnList.length}):`);
      initFnList.forEach((s) => console.log(`// function ${s}`));
    }
    if (mutList.length) {
      console.log(`\n// State-changing (${mutList.length}):`);
      mutList.forEach((s) => console.log(`// function ${s}`));
    }
    if (viewList.length) {
      console.log(`\n// View (${viewList.length}):`);
      viewList.forEach((s) => console.log(`// function ${s}`));
    }
    if (!SHOW_SOURCE) console.log("\nThêm --source để xem nội dung đầy đủ");
    return;
  }
  console.log(SKIP_SOURCIFY ? "Bỏ qua (--no-sourcify)." : "Không có.");

  // --- Gigahorse ---
  if (!fs.existsSync(tacFile)) {
    process.stdout.write("Fetching bytecode... ");
    const code = await rpc("eth_getCode", [address, "latest"]);
    if (!code || code === "0x") {
      console.error("Không có bytecode");
      return;
    }
    const hex = code.slice(2);
    console.log(`${hex.length / 2} bytes`);
    fs.writeFileSync(hexFile, hex);

    console.log(`Decompiling (timeout: ${TIMEOUT}s)...`);
    try {
      execSync(
        [
          GIGAHORSE,
          "--interpreted",
          `-T ${TIMEOUT}`,
          `-C ${path.join(DECOMPILE_DIR, "clients/visualizeout.py")}`,
          hexFile,
        ].join(" "),
        { stdio: "inherit", cwd: path.resolve(__dirname, "..") }
      );
    } catch {
      console.error("gigahorse thất bại");
      return;
    }

    if (!fs.existsSync(tacFile)) {
      console.error("Không có output (timeout hoặc lỗi)");
      return;
    }
  } else {
    console.log("Dùng cache gigahorse.");
  }

  // Build và lưu pseudo-Solidity
  const pseudo = await buildPseudoSolidity(outDir, address);
  fs.writeFileSync(solFile, pseudo);

  console.log(`\nSaved: ${solFile}`);
  console.log(pseudo);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length === 0) {
    console.error("Usage: node terminal/decompile-contract.js [--source] [--no-sourcify] <address> [address2] ...");
    process.exit(1);
  }
  for (const addr of args) {
    await decompileContract(addr);
  }
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
