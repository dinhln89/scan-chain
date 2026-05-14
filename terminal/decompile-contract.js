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

const SHOW_SOURCE = process.argv.includes("--source");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

// Tra cứu tên function từ 4byte.directory (free, no API key)
async function lookup4byte(selector) {
  const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}`;
  try {
    const { status, body } = await httpsGet(url);
    if (status !== 200) return null;
    const { results } = JSON.parse(body);
    if (!results || results.length === 0) return null;
    // Ưu tiên result có id nhỏ nhất (được đăng ký sớm nhất = phổ biến nhất)
    results.sort((a, b) => a.id - b.id);
    return results[0].text_signature;
  } catch {
    return null;
  }
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
    const operands = m[2];
    const hasAddrMask = operands.includes(ADDRESS_MASK);
    const hasBoolMask = /\(0x1\)/.test(operands);
    if (!hasAddrMask && !hasBoolMask) continue;

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

function inferType(varName, addressVars, boolVars) {
  // Normalise: strip leading 0x nếu có, lấy base trước V
  const base = varName.split("V")[0].replace(/^0x/, "");
  if (addressVars.has(base) || addressVars.has(varName)) return "address";
  if (boolVars.has(base) || boolVars.has(varName)) return "bool";
  return "uint256";
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

  // Collect và sort theo tên asc
  const pubList = [];
  for (const [block] of pubFns) {
    if ((blockToName.get(block) || "") === "__function_selector__") continue;
    const name = resolvedNames.get(block);
    if (name) pubList.push(name);
  }
  pubList.sort((a, b) => a.localeCompare(b));

  lines.push("// Public interface:");
  pubList.forEach((name) => lines.push(`// function ${name}`));
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

async function decompileContract(address) {
  address = address.toLowerCase();
  const name = `contract_${address.slice(2, 10)}`;
  const hexFile = path.join(DECOMPILE_DIR, `${name}.hex`);
  const outDir = path.join(TEMP_DIR, name, "out");
  const tacFile = path.join(outDir, "contract.tac");
  const solFile = path.join(TEMP_DIR, name, `${name}.sol`);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Contract: ${address}`);
  console.log("=".repeat(60));

  // --- Sourcify ---
  process.stdout.write("Tìm verified source (Sourcify)... ");
  const solFiles = await fetchSourcify(address);
  if (solFiles && solFiles.length > 0) {
    console.log(`Có! (${solFiles.length} files)`);
    for (const f of solFiles) {
      const dest = path.join(TEMP_DIR, name, f.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.content);
      console.log(`  Saved: ${dest}`);
      if (SHOW_SOURCE) {
        console.log(`\n// ${f.name}\n${"─".repeat(60)}`);
        console.log(f.content);
      }
    }
    if (!SHOW_SOURCE) console.log("  Thêm --source để xem nội dung");
    return;
  }
  console.log("Không có.");

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
    console.error("Usage: node terminal/decompile-contract.js [--source] <address> [address2] ...");
    process.exit(1);
  }
  for (const addr of args) {
    await decompileContract(addr);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
