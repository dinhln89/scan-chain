require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { rpc } = require("../core/trace");

const DECOMPILE_DIR = path.resolve(__dirname, "../decompile");
const TEMP_DIR = path.resolve(__dirname, "../.temp");
const GIGAHORSE = path.resolve(process.env.HOME, ".gigahorse/bin/gigahorse");
const TIMEOUT = process.env.DECOMPILE_TIMEOUT || 600;

async function decompileContract(address) {
  address = address.toLowerCase();
  const name = `contract_${address.slice(2, 10)}`;
  const hexFile = path.join(DECOMPILE_DIR, `${name}.hex`);
  const outDir = path.join(TEMP_DIR, name, "out");
  const tacFile = path.join(outDir, "contract.tac");
  const namesFile = path.join(outDir, "HighLevelFunctionName.csv");

  console.log(`\n[${address}]`);

  // Dùng cache nếu đã decompile rồi
  if (fs.existsSync(tacFile)) {
    console.log("  => Dùng cache:", tacFile);
    printResults(namesFile, tacFile);
    return;
  }

  // Fetch bytecode
  console.log("  Fetching bytecode...");
  const code = await rpc("eth_getCode", [address, "latest"]);
  if (!code || code === "0x") {
    console.error("  => Không có bytecode (EOA hoặc chưa deploy)");
    return;
  }
  const hex = code.slice(2);
  console.log(`  Bytecode: ${hex.length / 2} bytes`);
  fs.writeFileSync(hexFile, hex);

  // Chạy gigahorse
  console.log("  Decompiling (interpreted mode, timeout:", TIMEOUT, "s)...");
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
  } catch (e) {
    console.error("  => gigahorse thất bại:", e.message);
    return;
  }

  if (!fs.existsSync(tacFile)) {
    console.error("  => Không có output (timeout hoặc lỗi)");
    return;
  }

  printResults(namesFile, tacFile);
}

function printResults(namesFile, tacFile) {
  console.log("\n  [Public Functions]");
  if (fs.existsSync(namesFile)) {
    const lines = fs.readFileSync(namesFile, "utf8").trim().split("\n");
    const publicFns = lines.filter((l) => l.includes("(") && !l.startsWith("0x0\t"));
    if (publicFns.length === 0) {
      console.log("  (không resolve được tên nào)");
    } else {
      publicFns.forEach((l) => {
        const [block, name] = l.split("\t");
        console.log(`    ${name}`);
      });
    }
  }
  console.log("\n  TAC output:", tacFile);
}

async function main() {
  const addresses = process.argv.slice(2);
  if (addresses.length === 0) {
    console.error("Usage: node terminal/decompile-contract.js <address> [address2] ...");
    process.exit(1);
  }

  for (const addr of addresses) {
    await decompileContract(addr);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
