const sequelize = require("./db");
const User = require("./models/User");
const { createLogger } = require("./core/logger");

const log = createLogger("terminal", { console: true });

async function main() {
  await sequelize.authenticate();
  log.info("Ket noi thanh cong!");

  await sequelize.sync();

  await sequelize.close();
}

main().catch((err) => log.error(err.message));
