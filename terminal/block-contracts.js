const sequelize = require("../db");
const Contract = require("../models/Contract");
const { Op } = require("sequelize");
const readline = require("readline");

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const threshold = await new Promise((resolve) => {
    rl.question("Block tất cả contract có txCount > ", (ans) => {
      rl.close();
      resolve(parseInt(ans, 10));
    });
  });

  if (isNaN(threshold)) {
    console.error("Giá trị không hợp lệ.");
    process.exit(1);
  }

  await sequelize.ensureDatabase();
  await sequelize.sync();

  const [count] = await Contract.update(
    { isBlock: true },
    { where: { txCount: { [Op.gt]: threshold }, isBlock: false } },
  );

  console.log(`Đã block ${count} contract có txCount > ${threshold}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
