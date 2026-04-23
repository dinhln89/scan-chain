const sequelize = require('../db');
const Transaction = require('../models/Transaction');
const { analyzeTx } = require('../core/trace');

async function processTx(tx) {
  console.log(`  Hash  : https://bscscan.com/tx/${tx.hash}`);

  const { addresses, calls, transfers } = await analyzeTx(tx.hash);

  console.log(`  Addresses: ${addresses.length}`);
  addresses.forEach((a) => console.log(`    ${a}`));

  if (calls.length === 0) {
    console.log('  Khong co getReserves / balanceOf');
  } else {
    calls.forEach((c, i) => {
      console.log(`  [${i}] ${c.fn} -> ${c.to}`);
      if (c.fn === 'getReserves()' && c.decoded)
        console.log(`       reserve0=${c.decoded.reserve0}  reserve1=${c.decoded.reserve1}`);
      if (c.fn === 'balanceOf(address)')
        console.log(`       wallet=${c.wallet}  balance=${c.decoded}`);
    });
  }

  console.log(`  Transfers: ${transfers.length}`);
  transfers.forEach((t, i) => {
    console.log(`    [${i}] token=${t.token}`);
    console.log(`         from =${t.from}`);
    console.log(`         to   =${t.to}`);
    console.log(`         amount=${t.amount}`);
  });
}

async function processNext() {
  const tx = await Transaction.findOne({
    where: { processed: false },
    order: [['blockNumber', 'ASC'], ['id', 'ASC']],
  });

  if (!tx) return;

  console.log(`\nXu ly tx: ${tx.hash}`);
  try {
    await processTx(tx);
    await tx.update({ processed: true });
    console.log('  -> Done');
  } catch (err) {
    console.error(`  -> Loi: ${err.message}`);
  }
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync({ alter: true });
  console.log('Bat dau xu ly transactions...');

  const loop = async () => {
    try {
      await processNext();
    } catch (err) {
      console.error('Loi:', err.message);
    }
    setTimeout(loop, 100);
  };

  loop();
}

main().catch(console.error);
