require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const path = require("path");
const { execSync } = require("child_process");

const TYPE_ARG = (process.argv.find((a) => a.startsWith("--type=")) || "--type=bsc").slice(7);
const DEBUG = process.argv.includes("--debug");

function decompileAndShowInit(address) {
  const cmd = `node ${path.join(__dirname, "decompile-contract.js")} --type=${TYPE_ARG} ${address}`;
  if (DEBUG) console.log("[cmd]", cmd);

  let output;
  try {
    output = execSync(cmd, { cwd: path.resolve(__dirname, ".."), encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });
  } catch (err) {
    output = err.stdout || "";
  }

  if (DEBUG) {
    console.log("[raw output]");
    console.log(output || "(empty)");
  }

  // Lấy block "One-time init"
  const lines = output.split("\n");
  const initLines = [];
  let inInit = false;
  for (const line of lines) {
    if (/\/\/ One-time init/.test(line)) { inInit = true; initLines.push(line.trim()); continue; }
    if (inInit) {
      if (line.startsWith("// function ") || line.startsWith("//   ")) {
        initLines.push(line.trim());
      } else {
        break;
      }
    }
  }

  console.log(`\n[${address}]`);
  if (initLines.length === 0) {
    console.log("  (khong co init method)");
  } else {
    initLines.forEach((l) => console.log(" ", l));
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length === 0) {
    console.error("Usage: node terminal/decompile-init.js [--type=bsc|eth] <address> [address2] ...");
    process.exit(1);
  }
  for (const addr of args) {
    decompileAndShowInit(addr);
  }
}

main().catch((err) => {
  console.error("Loi:", err.message || err);
  process.exit(1);
});
