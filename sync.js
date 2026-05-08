const sequelize = require('./db');

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
  console.log(`\nTìm thấy ${duplicates.length} index hash trùng lặp cần xóa`);

  done = withTimer('[2/4] Xóa index trùng lặp...');
  for (const idx of duplicates) {
    await qi.removeIndex('transactions', idx.name);
  }
  done();

  const newIndexExists = indexes.some(i => i.name === 'transactions_processed_block_number_id');
  if (!newIndexExists) {
    done = withTimer('[3/4] Tạo index mới...');
    await qi.addIndex('transactions', {
      fields: ['processed', 'blockNumber', 'id'],
      name: 'transactions_processed_block_number_id',
    });
    done();
  } else {
    console.log('[3/4] Index transactions_processed_block_number_id đã tồn tại, bỏ qua')
  }

  console.log('Hoàn tất!');
  process.exit(0);
}

main().catch(err => { console.error('Lỗi:', err.message); process.exit(1); });
