require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const sequelize = require("../db");
require("../models/ContractDecompile");

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function withTimer(label) {
  const start = Date.now();
  let frame = 0;
  const interval = setInterval(() => {
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(`\r${SPINNER[frame++ % SPINNER.length]} ${label} ${secs}s`);
  }, 100);
  return (note = "") => {
    clearInterval(interval);
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(`\r✓ ${label} ${secs}s${note ? `  (${note})` : ""}\n`);
  };
}

async function confirm(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (data) => {
      process.stdin.destroy();
      resolve(data.trim().toLowerCase() === "y");
    });
  });
}

async function getRowCount(table) {
  try {
    const [[{ n }]] = await sequelize.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    return Number(n);
  } catch {
    return null;
  }
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.authenticate();

  const count = await getRowCount("contract_decompiles");
  const ok = await confirm(`Xoa ${count ?? "?"} rows trong contract_decompiles? (y/N): `);
  if (!ok) {
    console.log("Huy.");
    return;
  }

  const done = withTimer("Truncate contract_decompiles...");
  await sequelize.query("TRUNCATE TABLE `contract_decompiles`");
  done();

  await sequelize.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
