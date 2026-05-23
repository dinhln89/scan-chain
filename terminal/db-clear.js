require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const sequelize = require("../db");
const { spawn } = require("child_process");

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

// Spawn background mysql process để DROP backup tables — user không cần chờ.
// Lần chạy tiếp theo sẽ chờ qua metadata lock nếu DROP vẫn đang chạy.
function dropTablesBackground(tableNames) {
  const { DB_HOST = "localhost", DB_PORT = "3306", DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  const sql = [
    "SET FOREIGN_KEY_CHECKS=0;",
    ...tableNames.map((t) => `DROP TABLE IF EXISTS \`${t}\`;`),
    "SET FOREIGN_KEY_CHECKS=1;",
  ].join(" ");
  const child = spawn(
    "mysql",
    [`-h${DB_HOST}`, `-P${DB_PORT}`, `-u${DB_USER}`, `-p${DB_PASSWORD}`, DB_NAME, "-e", sql],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
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

  const allRows = await sequelize.query("SHOW TABLES", { type: sequelize.QueryTypes.SELECT });
  const allTables = allRows.map((r) => Object.values(r)[0]);
  const bakTables = allTables.filter((t) => t.endsWith("_bak"));
  const mainTables = allTables.filter((t) => !t.endsWith("_bak"));

  if (mainTables.length === 0) {
    console.log("Khong co table nao.");
    await sequelize.close();
    return;
  }

  // Xoa backup tables cu (tu lan chay truoc). MySQL metadata lock dam bao
  // khong xung dot neu background DROP tu lan truoc van dang chay.
  if (bakTables.length > 0) {
    done = withTimer(`Xoa ${bakTables.length} backup tables cu...`);
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of bakTables) await sequelize.query(`DROP TABLE IF EXISTS \`${t}\``);
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
    done();
  }

  const rowCounts = await getApproxRowCounts(process.env.DB_NAME, mainTables);

  // Doc schema truoc khi rename
  const schemas = {};
  for (const table of mainTables) {
    const [[row]] = await sequelize.query(`SHOW CREATE TABLE \`${table}\``);
    schemas[table] = row["Create Table"];
  }

  // RENAME → CREATE: O(1) bat ke table lon den dau
  done = withTimer(`Reset ${mainTables.length} tables...`);
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of mainTables) {
    await sequelize.query(`RENAME TABLE \`${table}\` TO \`${table}_bak\``);
    await sequelize.query(schemas[table]);
    const n = rowCounts.get(table);
    process.stdout.write(`  ✓ ${table}${n != null ? ` (~${n} rows)` : ""}\n`);
  }
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
  done();

  // Spawn background DROP — user khong can cho
  dropTablesBackground(mainTables.map((t) => `${t}_bak`));
  console.log("(Backup tables dang xoa ngam trong nen...)");

  await sequelize.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
