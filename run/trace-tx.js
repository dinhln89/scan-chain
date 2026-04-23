const sequelize = require("../db");
const Transaction = require("../models/Transaction");
const ReviewTx = require("../models/ReviewTx");
const { analyzeTx } = require("../core/trace");

async function processTx(tx) {
  console.log(`  Hash  : https://bscscan.com/tx/${tx.hash}`);

  const { addresses, calls, transfers, isCallInput, isTransferSender } =
    await analyzeTx(tx.hash);

  const getReservesAddrs = new Set(
    calls
      .filter((c) => c.fn === "getReserves()")
      .map((c) => c.to?.toLowerCase()),
  );
  const balanceOfAddrs = new Set(
    calls
      .filter((c) => c.fn === "balanceOf(address)")
      .map((c) => c.to?.toLowerCase()),
  );

  await ReviewTx.upsert({
    txHash: tx.hash,
    address: tx.to.toLowerCase(),
    isCallInput: isCallInput,
    isTransferSender: isTransferSender,
    isGetReserves: getReservesAddrs.length > 0,
    isBalanceOf: balanceOfAddrs.length > 0,
  });

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
    console.log("  -> Done");
  } catch (err) {
    if (err.message === "NO_ERC20_TRANSFER") {
      await tx.update({ processed: true });
      console.log("  -> Bo qua (khong co ERC20 Transfer)");
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
