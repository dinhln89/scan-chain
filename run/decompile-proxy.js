require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const path = require("path");
const fs = require("fs");
const https = require("https");
const { execSync } = require("child_process");

const { createLogger } = require("../core/logger");
const { append } = require("../core/sheets");
const Proxy = require("../models/Proxy");
const sequelize = require("../db");

const log = createLogger(__filename);

const DECOMPILE_DIR = path.resolve(__dirname, "../decompile");
const FOURBYTE_CACHE = path.resolve(__dirname, "../data/4byte-cache.json");
const INIT_RE = /^(?:init|initialize|initialise|setup|setUp)/i;
const SHEET_NAME = "ProxySheet";
const DELAY_MS = 1000;
const IDLE_DELAY_MS = 5000;

const RPC = {
  bsc: process.env.BSC_RPC || "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2",
  eth: process.env.ETH_RPC || "https://eth-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2",
};

const EXPLORER = {
  bsc: (addr) => `https://bscscan.com/address/${addr}`,
  eth: (addr) => `https://etherscan.io/address/${addr}`,
};

// ── RPC helpers ───────────────────────────────────────────────────────────────

async function rpcCall(chain, method, params) {
  const res = await fetch(RPC[chain], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// ── 4byte lookup ──────────────────────────────────────────────────────────────

let _db4byte = undefined;
async function get4byteModel() {
  if (_db4byte !== undefined) return _db4byte;
  try {
    const FourByteSelector = require("../models/FourByteSelector");
    await FourByteSelector.sync();
    _db4byte = FourByteSelector;
  } catch {
    _db4byte = null;
  }
  return _db4byte;
}

function load4byteCache() {
  try { return JSON.parse(fs.readFileSync(FOURBYTE_CACHE, "utf8")); } catch { return {}; }
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

const _memCache = {};
async function lookup4byte(sel) {
  if (sel in _memCache) return _memCache[sel];

  const model = await get4byteModel();
  if (model) {
    try {
      const row = await model.findByPk(sel);
      if (row) { _memCache[sel] = row.signature; return row.signature; }
    } catch {}
  }

  const jsonCache = load4byteCache();
  if (sel in jsonCache) {
    _memCache[sel] = jsonCache[sel];
    return jsonCache[sel];
  }

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
  _memCache[sel] = sig;
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
  const initFns = [];
  for (const sel of selectors) {
    const sig = await lookup4byte(sel);
    if (sig && INIT_RE.test(sig.split("(")[0])) {
      initFns.push({ sel, sig });
    }
  }
  return initFns;
}

// ── eth_call check ────────────────────────────────────────────────────────────

const SIM_FROM = "0xff3f428583c15a5681584e9e5e86e270418ac4d3";
const ERROR_SELECTOR = "0x08c379a0";

async function checkInitCallable(chain, contractAddress, sel) {
  let callResult;
  try {
    const result = await rpcCall(chain, "eth_call", [
      { from: SIM_FROM, to: contractAddress, data: sel },
      "latest",
    ]);
    if (!result || result === "0x") {
      callResult = { callable: false, reason: "revert (no data)" };
    } else if (result.startsWith(ERROR_SELECTOR)) {
      try {
        const hex = result.slice(10);
        const len = parseInt(hex.slice(64, 128), 16) * 2;
        const reason = Buffer.from(hex.slice(128, 128 + len), "hex").toString("utf8");
        callResult = { callable: false, reason };
      } catch {
        callResult = { callable: false, reason: "revert" };
      }
    } else {
      callResult = { callable: true };
    }
  } catch (err) {
    const msg = (err.message || "").replace(/\s*:?\s*0x[0-9a-f]+$/i, "").trim();
    callResult = { callable: false, reason: msg };
  }
  return callResult;
}

// ── Subprocess fallback ───────────────────────────────────────────────────────

function decompileViaSubprocess(chain, address) {
  const cmd = `node ${path.join(__dirname, "../terminal/decompile-init.js")} --type=${chain} ${address}`;
  let output;
  try {
    output = execSync(cmd, {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    output = err.stdout || "";
  }

  const initFns = [];
  const FN_RE = /\/\/\s*function\s+(?:external\s+)?(\S+\([^)]*\))/i;
  for (const line of output.split("\n")) {
    const m = line.match(FN_RE);
    if (m && INIT_RE.test(m[1].split("(")[0])) {
      initFns.push(m[1]);
    }
  }
  return initFns;
}

// ── Process one proxy record ──────────────────────────────────────────────────

async function processProxy(record) {
  const { proxy, implementation, chain } = record;
  const explorerFn = EXPLORER[chain] || EXPLORER.bsc;

  log.info(`[${chain}] ${proxy} → ${implementation}`);

  const contractName = `contract_${implementation.slice(2, 10)}`;
  const dasmFile = path.join(DECOMPILE_DIR, ".temp", contractName, "contract.dasm");

  let rows = [];

  if (fs.existsSync(dasmFile)) {
    const initFns = await findInitFromDasm(dasmFile);
    if (initFns.length === 0) {
      rows.push(buildRow(chain, proxy, implementation, explorerFn, "(none)", "-", ""));
    } else {
      for (const { sel, sig } of initFns) {
        const check = await checkInitCallable(chain, proxy, sel);
        const callable = check.callable ? "YES" : `NO: ${check.reason}`;
        rows.push(buildRow(chain, proxy, implementation, explorerFn, sig, callable, sel));
      }
    }
  } else {
    const sigs = decompileViaSubprocess(chain, implementation);
    if (sigs.length === 0) {
      rows.push(buildRow(chain, proxy, implementation, explorerFn, "(none)", "-", ""));
    } else {
      for (const sig of sigs) {
        rows.push(buildRow(chain, proxy, implementation, explorerFn, sig, "?", ""));
      }
    }
  }

  await append(rows, { sheet: SHEET_NAME });
  await record.update({ decompileInitDone: true });
  log.info(`  → inserted ${rows.length} row(s) into ${SHEET_NAME}`);
}

function buildRow(chain, proxy, impl, explorerFn, initSig, callable, selector) {
  return [
    new Date().toLocaleString(),
    chain.toUpperCase(),
    explorerFn(proxy),
    explorerFn(impl),
    initSig,
    callable,
    selector,
  ];
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function loop() {
  let delay = DELAY_MS;
  try {
    const record = await Proxy.findOne({ where: { decompileInitDone: false } });
    if (record) {
      await processProxy(record);
    } else {
      delay = IDLE_DELAY_MS;
    }
  } catch (err) {
    log.error(`Loop error: ${err.message}`);
    if (err.stack) log.error(err.stack);
    delay = IDLE_DELAY_MS;
  }
  setTimeout(loop, delay);
}

async function main() {
  await sequelize.authenticate();
  await Proxy.sync({ alter: true });
  log.info(`decompile-proxy started (delay=${DELAY_MS}ms, sheet=${SHEET_NAME})`);
  loop();
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
