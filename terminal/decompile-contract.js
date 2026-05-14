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
function buildPseudoSolidity(outDir, address) {
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
  const selectorToName = new Map(names.map(([block, name]) => [block, name]));

  const resolved = names.filter(([, n]) => n && n.includes("(") && n !== "__function_selector__");
  if (resolved.length > 0) {
    lines.push("// Public interface:");
    resolved.forEach(([block, name]) => {
      if (/^0x[0-9a-f]+$/.test(name)) return; // unresolved hex
      lines.push(`// function ${name}`);
    });
    lines.push("");
  }

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
  const pseudo = buildPseudoSolidity(outDir, address);
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
