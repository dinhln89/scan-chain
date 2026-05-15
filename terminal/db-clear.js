require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const sequelize = require("../db");

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

  await sequelize.ensureDatabase();

  const tables = ["transactions", "contracts", "contract_decompiles", "ignore_addresses", "settings", "tokens", "users"];

  for (const table of tables) {
    try {
      await sequelize.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`Xoa ${table} xong`);
    } catch (err) {
      console.log(`Bo qua ${table}: ${err.message}`);
    }
  }

  // ALTER tren bang rong chay ngay lap tuc
  try {
    await sequelize.query("ALTER TABLE `transactions` MODIFY COLUMN `type` VARCHAR(20) NOT NULL DEFAULT 'bsc'");
    console.log("Doi kieu cot type thanh VARCHAR xong");
  } catch (err) {
    console.log(`Bo qua alter type: ${err.message}`);
  }

  await sequelize.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
