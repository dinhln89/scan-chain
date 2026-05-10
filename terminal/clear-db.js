require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const sequelize = require("../db");
require("../models/Contract");
require("../models/IgnoreAddress");
require("../models/Setting");
require("../models/Token");
require("../models/Transaction");
require("../models/User");

async function main() {
  await sequelize.sync();

  const tables = ["transactions", "contracts", "ignore_addresses", "settings", "tokens", "users"];

  for (const table of tables) {
    try {
      await sequelize.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`Xoa ${table} xong`);
    } catch (err) {
      console.log(`Bo qua ${table}: ${err.message}`);
    }
  }

  await sequelize.sync({ force: false, alter: true });
  console.log("Recreate indexes xong");

  await sequelize.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
