const sequelize = require('../db');
const ReviewTx = require('../models/ReviewTx');
const Transaction = require('../models/Transaction');
const { createLogger } = require('../core/logger');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const log = createLogger('terminal', { console: true });

async function main() {
  await sequelize.sync();

  const deleted = await ReviewTx.destroy({ where: {}, truncate: true });
  log.info(`Da xoa ReviewTx: ${deleted} records`);

  const [updated] = await Transaction.update(
    { processed: false },
    { where: { processed: true } },
  );
  log.info(`Da reset Transaction.processed: ${updated} records`);

  await sequelize.close();
}

main().catch((err) => {
  log.error(`Loi: ${err.message}`);
  process.exit(1);
});
