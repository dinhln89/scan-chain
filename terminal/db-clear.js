require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const sequelize = require("../db");

// Import để đăng ký models với sequelize trước khi sync
require("../models/Transaction");
require("../models/Contract");
require("../models/ContractDecompile");
require("../models/Setting");
require("../models/Token");
require("../models/User");
require("../models/FourByteSelector");
require("../models/IgnoreAddress");
require("../models/History");
require("../models/Proxy");

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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

async function main() {
  const ok = await confirm("Xoa toan bo du lieu trong DB? (y/N): ");
  if (!ok) {
    console.log("Huy.");
    return;
  }

  const dbName = process.env.DB_NAME;
  let done;

  done = withTimer("Ket noi...");
  await sequelize.ensureDatabase();
  done();

  console.log("");
  done = withTimer(`DROP DATABASE \`${dbName}\`...`);
  await sequelize.query(`DROP DATABASE \`${dbName}\``);
  done();

  done = withTimer(`CREATE DATABASE \`${dbName}\`...`);
  await sequelize.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  done();

  done = withTimer("Tao lai tables + indexes...");
  await sequelize.query(`USE \`${dbName}\``);
  await sequelize.sync();
  done();

  await sequelize.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
