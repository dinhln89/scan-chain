require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const sequelize = require("../db");
const Contract = require("../models/Contract");
const Transaction = require("../models/Transaction");
const Setting = require("../models/Setting");

async function main() {
  await sequelize.sync();

  await Contract.destroy({ where: {}, truncate: true });
  console.log("Xoa Contract xong");

  await Transaction.destroy({ where: {}, truncate: true });
  console.log("Xoa Transaction xong");

  await Setting.destroy({ where: {}, truncate: true });
  console.log("Xoa Setting xong");

  // Drop va recreate tat ca index
  const qi = sequelize.getQueryInterface();
  const tables = ["transactions", "settings"];
  for (const table of tables) {
    try {
      const indexes = await qi.showIndex(table);
      for (const idx of indexes) {
        if (idx.primary) continue;
        await qi.removeIndex(table, idx.name);
        console.log(`Drop index ${idx.name} tren ${table}`);
      }
    } catch {
      // table co the chua ton tai
    }
  }

  // Recreate indexes qua sync force
  await sequelize.sync({ force: false, alter: true });
  console.log("Recreate indexes xong");

  await sequelize.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
