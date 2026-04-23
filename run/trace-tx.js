const sequelize = require("../db");
const Transaction = require("../models/Transaction");
const ReviewTx = require("../models/ReviewTx");
const { analyzeTx, isContract } = require("../core/trace");

async function processTx(tx) {
  console.log(`  Hash  : https://bscscan.com/tx/${tx.hash}`);

  const { addresses, calls, transfers } = await analyzeTx(tx.hash);

  const getReservesAddrs = new Set(
    calls.filter((c) => c.fn === 'getReserves()').map((c) => c.to?.toLowerCase())
  );
  const balanceOfAddrs = new Set(
    calls.filter((c) => c.fn === 'balanceOf(address)').map((c) => c.to?.toLowerCase())
  );

  const rows = [];

  rows.push({ address: tx.from.toLowerCase(), source: 'sender' });

  for (const addr of addresses) {
    rows.push({ address: addr.toLowerCase(), source: 'input' });
  }

  for (const t of transfers) {
    rows.push({ address: t.from.toLowerCase(),  source: 'transfer' });
    rows.push({ address: t.to.toLowerCase(),    source: 'transfer' });
    rows.push({ address: t.token.toLowerCase(), source: 'transfer' });
  }

  // dedup by address+source, insert
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.address}:${row.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await ReviewTx.upsert({
      txHash:        tx.hash,
      address:       row.address,
      source:        row.source,
      isGetReserves: getReservesAddrs.has(row.address),
      isBalanceOf:   balanceOfAddrs.has(row.address),
    });
  }

  console.log(`  ReviewTx: ${seen.size} records inserted`);

  // collect all unique addresses
  const allAddrs = [...new Set([...seen].map((k) => k.split(':')[0]))];

  // check contract in parallel (batch 5)
  let contractCount = 0;
  for (let i = 0; i < allAddrs.length; i += 5) {
    const batch = allAddrs.slice(i, i + 5);
    await Promise.all(
      batch.map(async (addr) => {
        if (await isContract(addr)) contractCount++;
      })
    );
  }
  console.log(`  Contracts: ${contractCount} inserted`);
}

async function processNext() {
  const tx = await Transaction.findOne({
    where: { processed: false },
    order: [
      ["blockNumber", "ASC"],
      ["id", "ASC"],
    ],
  });

  if (!tx) return;

  console.log(`\nXu ly tx: ${tx.hash}`);
  try {
    await processTx(tx);
    await tx.update({ processed: true });
    console.log('  -> Done');
  } catch (err) {
    const skip = ['NO_ERC20_TRANSFER', 'IGNORED_METHOD', 'IGNORED_ADDRESS'];
    if (skip.includes(err.message)) {
      await tx.update({ processed: true });
      console.log(`  -> Bo qua (${err.message})`);
    } else {
      console.error(`  -> Loi: ${err.message}`);
    }
  }
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync({ alter: true });
  console.log("Bat dau xu ly transactions...");

  const loop = async () => {
    try {
      await processNext();
    } catch (err) {
      console.error("Loi:", err.message);
    }
    setTimeout(loop, 100);
  };

  loop();
}

main().catch(console.error);
