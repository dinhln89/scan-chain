const sequelize = require("../db");
const Transaction = require("../models/Transaction");
const ReviewTx = require("../models/ReviewTx");
const { analyzeTx } = require("../core/trace");
const { append } = require("../core/sheets");

async function processTx(tx) {
  const {
    addresses,
    calls,
    transfers,
    isCallInput,
    isTransferSender,
    selector,
    tokenNames,
    tokenSymbols,
  } = await analyzeTx(tx.hash);

  if (isTransferSender) {
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

    // await ReviewTx.upsert({
    //   txHash: tx.hash,
    //   address: tx.to.toLowerCase(),
    //   selector,
    //   isCallInput,
    //   isGetReserves: getReservesAddrs.size > 0,
    //   isBalanceOf: balanceOfAddrs.size > 0,
    // });

    const tokenNameList = Object.values(tokenNames).filter(Boolean).join(", ");
    const tokenSymbolList = Object.values(tokenSymbols).filter(Boolean).join(", ");

    await append([
      [
        tx.hash,
        `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
        `https://bscscan.com/tx/${tx.hash}`,
        isCallInput ? "YES" : "NO",
        getReservesAddrs.size > 0 ? "YES" : "NO",
        balanceOfAddrs.size > 0 ? "YES" : "NO",
        tx.blockNumber,
        selector ?? "",
        tokenNameList,
        tokenSymbolList,
      ],
    ]);
  }
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
    console.log("  -> DONE!!!!!!!!");
    console.log(`  -> Hash  : https://bscscan.com/tx/${tx.hash}`);
  } catch (err) {
    if (
      err.message === "NO_ERC20_TRANSFER" ||
      err.message === "IGNORED_METHOD" ||
      err.message === "IGNORED_ADDRESS"
    ) {
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
