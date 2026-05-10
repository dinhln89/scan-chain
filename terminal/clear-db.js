require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const sequelize = require('../db');
const Transaction = require('../models/Transaction');
const ReviewTx = require('../models/ReviewTx');
const Contract = require('../models/Contract');
const Setting = require('../models/Setting');
const Token = require('../models/Token');

async function main() {
  await sequelize.sync();

  await ReviewTx.destroy({ where: {}, truncate: true });
  console.log('Xoa ReviewTx xong');

  await Transaction.destroy({ where: {}, truncate: true });
  console.log('Xoa Transaction xong');

  await Contract.destroy({ where: {}, truncate: true });
  console.log('Xoa Contract xong');

  await Setting.destroy({ where: {}, truncate: true });
  console.log('Xoa Setting xong');

  await Token.destroy({ where: {}, truncate: true });
  console.log('Xoa Token xong');

  // Drop va recreate tat ca index
  const qi = sequelize.getQueryInterface();
  const tables = ['transactions', 'review_txes', 'contracts', 'settings', 'tokens'];
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
  console.log('Recreate indexes xong');

  await sequelize.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Loi:', err.message);
  process.exit(1);
});
