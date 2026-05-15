const sequelize = require('./db');
const { createLogger } = require('./core/logger');

const log = createLogger(__filename, { console: false });

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function withTimer(label) {
  const start = Date.now();
  let frame = 0;
  const interval = setInterval(() => {
    const secs = Math.floor((Date.now() - start) / 1000);
    process.stdout.write(`\r${SPINNER[frame % SPINNER.length]} ${label} ${secs}s`);
    frame++;
  }, 100);
  return () => {
    clearInterval(interval);
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(`\r✓ ${label} ${secs}s\n`);
    log.info(`${label} ${secs}s`);
  };
}

async function main() {
  let done;

  done = withTimer('[1/4] Kết nối database...');
  await sequelize.ensureDatabase();
  done();

  const qi = sequelize.getQueryInterface();

  const indexes = await qi.showIndex('transactions');
  const duplicates = indexes.filter(i =>
    i.fields.length === 1 &&
    i.fields[0].attribute === 'hash' &&
    i.name !== 'transactions_hash'
  );
  process.stdout.write(`\nTìm thấy ${duplicates.length} index hash trùng lặp cần xóa\n`);
  log.info(`Tim thay ${duplicates.length} index hash trung lap can xoa`);

  done = withTimer('[2/4] Xóa index trùng lặp...');
  for (const idx of duplicates) {
    await qi.removeIndex('transactions', idx.name);
  }
  done();

  const newIndexExists = indexes.some(i => i.name === 'transactions_processed_block_number_id');
  if (!newIndexExists) {
    done = withTimer('[3/5] Tạo index transactions mới...');
    await qi.addIndex('transactions', {
      fields: ['processed', 'blockNumber', 'id'],
      name: 'transactions_processed_block_number_id',
    });
    done();
  } else {
    process.stdout.write('[3/5] Index transactions_processed_block_number_id đã tồn tại, bỏ qua\n');
    log.info('Index transactions_processed_block_number_id da ton tai, bo qua');
  }

  const contractIndexes = await qi.showIndex('contracts');
  const isBlockIndexExists = contractIndexes.some(i => i.name === 'contracts_is_block');
  if (!isBlockIndexExists) {
    done = withTimer('[4/6] Tạo index contracts.isBlock...');
    await qi.addIndex('contracts', {
      fields: ['isBlock'],
      name: 'contracts_is_block',
    });
    done();
  } else {
    process.stdout.write('[4/6] Index contracts_is_block đã tồn tại, bỏ qua\n');
    log.info('Index contracts_is_block da ton tai, bo qua');
  }

  const { DataTypes } = require('sequelize');
  const decompileColumns = await qi.describeTable('contract_decompiles').catch(() => null);
  if (decompileColumns && !decompileColumns.chain) {
    done = withTimer('[5/6] Thêm cột chain vào contract_decompiles...');
    await qi.addColumn('contract_decompiles', 'chain', {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'bsc',
      after: 'proxyOf',
    });
    done();
  } else {
    process.stdout.write('[5/6] Cột chain đã tồn tại, bỏ qua\n');
    log.info('Cot chain da ton tai, bo qua');
  }

  process.stdout.write('[6/6] Hoàn tất!\n');
  log.info('Hoan tat');
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`Lỗi: ${err.message}\n`);
  log.error(`Loi: ${err.message}`);
  process.exit(1);
});
