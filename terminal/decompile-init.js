require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const path = require("path");
const fs = require("fs");
const https = require("https");
const { execSync } = require("child_process");

const TYPE_ARG = (process.argv.find((a) => a.startsWith("--type=")) || "--type=bsc").slice(7);
const DEBUG = process.argv.includes("--debug");

const RPC_URL = TYPE_ARG === "eth"
  ? (process.env.ETH_RPC || "https://eth-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2")
  : (process.env.BSC_RPC || "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2");

const DECOMPILE_DIR = path.resolve(__dirname, "../decompile");
const FOURBYTE_CACHE = path.resolve(__dirname, "../data/4byte-cache.json");
const INIT_RE = /^(?:init|initialize|initialise|setup|setUp)/i;

// ── DB lazy init ──────────────────────────────────────────────────────────────

let _db = null;
async function getDb() {
  if (_db !== undefined) return _db;
  try {
    const sequelize = require("../db");
    await sequelize.ensureDatabase();
    _db = require("../models/FourByteSelector");
    await _db.sync();
  } catch {
    _db = null;
  }
  return _db;
}

// ── EIP-1967 proxy detection ──────────────────────────────────────────────────

const EIP1967_SLOTS = [
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
  "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7",
];

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function detectProxy(address) {
  const results = await Promise.all(
    EIP1967_SLOTS.map((slot) => rpcCall("eth_getStorageAt", [address, slot, "latest"])),
  );
  for (const val of results) {
    const addr = val?.slice(-40);
    if (addr && addr !== "0".repeat(40)) return "0x" + addr;
  }
  return null;
}

// ── 4byte lookup (sequential, với cache) ─────────────────────────────────────

function load4byteCache() {
  try { return JSON.parse(fs.readFileSync(FOURBYTE_CACHE, "utf8")); } catch { return {}; }
}

function save4byteCache(cache) {
  try {
    fs.mkdirSync(path.dirname(FOURBYTE_CACHE), { recursive: true });
    fs.writeFileSync(FOURBYTE_CACHE, JSON.stringify(cache, null, 2));
  } catch {}
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

async function lookup4byte(sel, cache) {
  if (sel in cache) return cache[sel];

  const model = await getDb();

  // 1. DB
  if (model) {
    try {
      const row = await model.findByPk(sel);
      if (row) { cache[sel] = row.signature; return row.signature; }
    } catch {}
  }

  // 2. JSON file cache (migrate sang DB nếu tìm thấy)
  const jsonCache = load4byteCache();
  if (sel in jsonCache) {
    const sig = jsonCache[sel];
    if (sig && model) {
      try { await model.upsert({ selector: sel, signature: sig }); } catch {}
    }
    cache[sel] = sig;
    return sig;
  }

  // 3. 4byte API
  let sig = null;
  try {
    const { status, body } = await httpsGet(
      `https://www.4byte.directory/api/v1/signatures/?hex_signature=${sel}`,
    );
    if (status === 200) {
      const { results } = JSON.parse(body);
      if (results && results.length > 0) {
        results.sort((a, b) => a.id - b.id);
        sig = results[0].text_signature;
      }
    }
  } catch {}

  if (sig && model) {
    try { await model.upsert({ selector: sel, signature: sig }); } catch {}
  }
  cache[sel] = sig;
  return sig;
}

// ── Dasm-based init lookup ────────────────────────────────────────────────────

function extractSelectorsFromDasm(dasmFile) {
  const content = fs.readFileSync(dasmFile, "utf8");
  const sels = new Set();
  for (const m of content.matchAll(/PUSH4\s+(0x[0-9a-f]{8})/gi)) {
    const s = m[1].toLowerCase();
    if (s !== "0xffffffff") sels.add(s);
  }
  return [...sels];
}

async function findInitFromDasm(dasmFile) {
  const selectors = extractSelectorsFromDasm(dasmFile);
  if (DEBUG) console.log(`[dasm] ${selectors.length} selectors found`);

  const cache = load4byteCache();
  const initFns = [];
  for (const sel of selectors) {
    const sig = await lookup4byte(sel, cache);
    if (sig && INIT_RE.test(sig.split("(")[0])) {
      initFns.push(sig);
    }
  }
  save4byteCache(cache);
  return initFns;
}

// ── Fallback: decompile-contract.js subprocess ───────────────────────────────

function decompileViaSubprocess(address) {
  const cmd = `node ${path.join(__dirname, "decompile-contract.js")} --type=${TYPE_ARG} ${address}`;
  if (DEBUG) console.log("[cmd]", cmd);
  let output;
  try {
    output = execSync(cmd, {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "inherit"],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    output = err.stdout || "";
  }
  if (DEBUG) console.log("[raw output]\n" + (output || "(empty)"));

  const lines = output.split("\n");
  const initLines = [];
  let inInit = false;
  for (const line of lines) {
    if (/\/\/ One-time init/.test(line)) { inInit = true; initLines.push(line.trim()); continue; }
    if (inInit) {
      if (line.startsWith("// function ") || line.startsWith("//   ")) initLines.push(line.trim());
      else break;
    }
  }
  const INIT_LINE_RE = /^\/\/ function (?:external\s+)?(?:init|initialize|initialise|setup|setUp)/i;
  lines.filter((l) => INIT_LINE_RE.test(l.trim()) && !initLines.includes(l.trim()))
    .forEach((l) => { if (initLines.length === 0) initLines.push("// (found via name search):"); initLines.push(l.trim()); });
  return initLines;
}

// ── Main flow ─────────────────────────────────────────────────────────────────

async function processAddress(address) {
  address = address.toLowerCase();
  console.log(`\n[${address}]`);

  const impl = await detectProxy(address);
  const target = impl || address;
  if (impl) console.log(`  Proxy → implementation: ${impl}`);

  // Tính tên contract (8 hex chars sau 0x)
  const contractName = `contract_${target.slice(2, 10)}`;
  const dasmFile = path.join(DECOMPILE_DIR, ".temp", contractName, "contract.dasm");

  if (fs.existsSync(dasmFile)) {
    console.log(`  Dasm cache: ${dasmFile}`);
    const initFns = await findInitFromDasm(dasmFile);
    if (initFns.length === 0) {
      console.log("  (khong co init method)");
    } else {
      console.log(`  // One-time init (${initFns.length}):`);
      initFns.forEach((sig) => console.log(`  // function external ${sig}`));
    }
  } else {
    console.log("  Chay decompile-contract.js...");
    const lines = decompileViaSubprocess(target);
    if (lines.length === 0) console.log("  (khong co init method)");
    else lines.forEach((l) => console.log(" ", l));
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length === 0) {
    console.error("Usage: node terminal/decompile-init.js [--type=bsc|eth] [--debug] <address> ...");
    process.exit(1);
  }
  for (const addr of args) {
    await processAddress(addr);
  }
}

main().catch((err) => {
  console.error("Loi:", err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
