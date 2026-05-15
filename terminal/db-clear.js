require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const sequelize = require("../db");

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

async function getRowCount(table) {
  try {
    const [[{ n }]] = await sequelize.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    return Number(n);
  } catch {
    return null;
  }
}

async function main() {
  const ok = await confirm("Xoa toan bo du lieu trong DB? (y/N): ");
  if (!ok) {
    console.log("Huy.");
    return;
  }

  let done;

  done = withTimer("Ket noi database...");
  await sequelize.ensureDatabase();
  done();

  const tables = ["transactions", "contracts", "contract_decompiles", "four_byte_selectors", "ignore_addresses", "settings", "tokens", "users"];

  console.log("");
  for (const table of tables) {
    const count = await getRowCount(table);
    if (count === null) {
      console.log(`  ✗ ${table}: khong ton tai, bo qua`);
      continue;
    }
    done = withTimer(`TRUNCATE ${table}`);
    try {
      await sequelize.query(`TRUNCATE TABLE \`${table}\``);
      done(`${count.toLocaleString()} rows xoa`);
    } catch (err) {
      done(`loi: ${err.message}`);
    }
  }

  console.log("");
  done = withTimer("ALTER transactions.type → VARCHAR(20)");
  try {
    await sequelize.query("ALTER TABLE `transactions` MODIFY COLUMN `type` VARCHAR(20) NOT NULL DEFAULT 'bsc'");
    done();
  } catch (err) {
    done(`loi: ${err.message}`);
  }

  await sequelize.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
