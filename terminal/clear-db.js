const sequelize = require('../db');
const ReviewTx = require('../models/ReviewTx');
const Transaction = require('../models/Transaction');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  await sequelize.sync();

  const deleted = await ReviewTx.destroy({ where: {}, truncate: true });
  console.log('Da xoa ReviewTx:', deleted, 'records');

  const [updated] = await Transaction.update(
    { processed: false },
    { where: { processed: true } },
  );
  console.log('Da reset Transaction.processed:', updated, 'records');

  await sequelize.close();
}

main().catch((err) => {
  console.error('Loi:', err.message);
  process.exit(1);
});
