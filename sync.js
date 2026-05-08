const sequelize = require('./db');

async function main() {
  await sequelize.ensureDatabase();
  const qi = sequelize.getQueryInterface();

  await qi.removeIndex('transactions', 'transactions_processed');
  await qi.addIndex('transactions', {
    fields: ['processed', 'blockNumber', 'id'],
    name: 'transactions_processed_block_number_id',
  });

  console.log('Done');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
