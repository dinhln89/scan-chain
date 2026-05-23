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

async function getApproxRowCounts(dbName, tableNames) {
  try {
    const rows = await sequelize.query(
      `SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${tableNames.map(() => "?").join(",")})`,
      { replacements: [dbName, ...tableNames], type: sequelize.QueryTypes.SELECT },
    );
    return new Map(rows.map((r) => [r.TABLE_NAME, Number(r.TABLE_ROWS)]));
  } catch {
    return new Map();
  }
}

async function main() {
  const ok = await confirm("Xoa toan bo du lieu trong DB? (y/N): ");
  if (!ok) {
    console.log("Huy.");
    return;
  }

  let done;

  done = withTimer("Ket noi...");
  await sequelize.authenticate();
  done();

  console.log("");

  const tables = await sequelize.query("SHOW TABLES", { type: sequelize.QueryTypes.SELECT });
  const tableNames = tables.map((t) => Object.values(t)[0]);

  if (tableNames.length === 0) {
    console.log("Khong co table nao.");
    await sequelize.close();
    return;
  }

  const rowCounts = await getApproxRowCounts(process.env.DB_NAME, tableNames);

  done = withTimer(`TRUNCATE ${tableNames.length} tables...`);
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of tableNames) {
    await sequelize.query(`TRUNCATE TABLE \`${table}\``);
    const n = rowCounts.get(table);
    process.stdout.write(`  ✓ ${table}${n != null ? ` (~${n} rows)` : ""}\n`);
  }
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
  done();

  await sequelize.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
