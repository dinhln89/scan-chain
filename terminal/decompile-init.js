require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const path = require("path");
const { execSync } = require("child_process");

const TYPE_ARG = (process.argv.find((a) => a.startsWith("--type=")) || "--type=bsc").slice(7);
const DEBUG = process.argv.includes("--debug");

const RPC_URL = TYPE_ARG === "eth"
  ? (process.env.ETH_RPC || "https://eth-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2")
  : (process.env.BSC_RPC || "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2");

const EIP1967_SLOTS = [
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", // EIP-1967 impl
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50", // EIP-1967 beacon
  "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7", // EIP-1822 UUPS
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

function decompileAndShowInit(address) {
  const cmd = `node ${path.join(__dirname, "decompile-contract.js")} --type=${TYPE_ARG} ${address}`;
  if (DEBUG) console.log("[cmd]", cmd);

  let output;
  try {
    output = execSync(cmd, {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "inherit"],
    });
  } catch (err) {
    output = err.stdout || "";
  }

  if (DEBUG) { console.log("[raw output]\n" + (output || "(empty)")); }

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

  if (initLines.length === 0) {
    console.log("  (khong co init method)");
  } else {
    initLines.forEach((l) => console.log(" ", l));
  }
}

async function processAddress(address) {
  address = address.toLowerCase();
  console.log(`\n[${address}]`);

  const impl = await detectProxy(address);
  if (impl) {
    console.log(`  Proxy → implementation: ${impl}`);
    decompileAndShowInit(impl);
  } else {
    decompileAndShowInit(address);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length === 0) {
    console.error("Usage: node terminal/decompile-init.js [--type=bsc|eth] [--debug] <address> [address2] ...");
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
