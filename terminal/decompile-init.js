require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const path = require("path");
const { execSync } = require("child_process");
const sequelize = require("../db");
const ContractDecompile = require("../models/ContractDecompile");
const Proxy = require("../models/Proxy");

const TYPE_ARG = (process.argv.find((a) => a.startsWith("--type=")) || "--type=bsc").slice(7);
const FORCE = process.argv.includes("--force");

function parseJsonField(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// Resolve proxy chain đến implementation cuối cùng
async function resolveImpl(address) {
  let addr = address.toLowerCase();
  const visited = new Set();
  while (true) {
    if (visited.has(addr)) break;
    visited.add(addr);
    const row = await ContractDecompile.findByPk(addr);
    if (row?.proxyOf && row.source === "proxy") {
      addr = row.proxyOf.toLowerCase();
    } else {
      break;
    }
  }
  return addr;
}

async function getInitMethods(address) {
  const impl = await resolveImpl(address);
  const row = await ContractDecompile.findByPk(impl);
  if (!row) return null;
  const fns = parseJsonField(row.functions);
  return {
    impl,
    source: row.source,
    chain: row.chain,
    initFns: fns.filter((f) => f.group === "One-time init"),
  };
}

function decompile(address) {
  const cmd = `node ${path.join(__dirname, "decompile-contract.js")} --type=${TYPE_ARG} ${address}`;
  try {
    execSync(cmd, { stdio: "inherit", cwd: path.resolve(__dirname, "..") });
  } catch {
    // lỗi đã in ra stdio
  }
}

async function processAddress(address) {
  address = address.toLowerCase();

  // Kiểm tra DB cache
  let info = await getInitMethods(address);

  if (!info || FORCE) {
    console.log(`\n[decompile] ${address}`);
    decompile(address);
    info = await getInitMethods(address);
  }

  if (!info) {
    console.log(`${address}: decompile that bai`);
    return;
  }

  const label = info.impl !== address ? `${address} → ${info.impl}` : address;
  if (info.initFns.length === 0) {
    console.log(`\n${label}: khong co init method (${info.source})`);
  } else {
    console.log(`\n${label} (${info.source}, ${info.chain}) — init methods:`);
    info.initFns.forEach((f) => console.log(`  function ${f.sig}`));
  }
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();

  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  let addresses;
  if (args.length > 0) {
    addresses = args;
  } else {
    // Lấy tất cả implementation từ Proxy model theo chain
    const rows = await Proxy.findAll({
      where: { chain: TYPE_ARG },
      attributes: ["implementation"],
      group: ["implementation"],
    });
    addresses = rows.map((r) => r.implementation);
    console.log(`Proxy model [${TYPE_ARG}]: ${addresses.length} unique implementations`);
  }

  for (const addr of addresses) {
    await processAddress(addr);
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
