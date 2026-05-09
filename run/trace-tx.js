const sequelize = require("../db");
const Transaction = require("../models/Transaction");
const ReviewTx = require("../models/ReviewTx");
const { analyzeTx } = require("../core/trace");
const { append } = require("../core/sheets");
const { createLogger } = require("../core/logger");

const log = createLogger(__filename);

async function processTx(tx, txData) {
  const {
    addresses,
    calls,
    transfers,
    isCallInput,
    isTransferSender,
    isTransferFromErc20,
    selector,
    tokenSymbols,
    hasV3Path,
  } = await analyzeTx(tx.hash, txData);

  const tokenSymbolList = Object.values(tokenSymbols)
    .filter(Boolean)
    .join(", ");

  if (isTransferFromErc20) {
    const now = new Date();
    await append(
      [
        [
          tx.hash,
          `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
          `https://bscscan.com/tx/${tx.hash}`,
          tokenSymbolList,
          "YES",
          selector ?? "",
          tx.blockNumber,
          now.toLocaleString(),
          hasV3Path ? "v3Path" : "",
        ],
      ],
      { sheet: "Sheet4" },
    );
  }

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

    const now = new Date();
    await append([
      [
        tx.hash,
        `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
        `https://bscscan.com/tx/${tx.hash}`,
        tokenSymbolList,
        isCallInput ? "YES" : "NO",
        getReservesAddrs.size > 0 ? "YES" : "",
        balanceOfAddrs.size > 0 ? "YES" : "",
        selector ?? "",
        tx.blockNumber,
        now.toLocaleString(),
        hasV3Path ? "v3Path" : "",
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

  log.info(`Xu ly tx: ${tx.hash}`);
  try {
    await processTx(tx, { from: tx.from, to: tx.to, input: tx.input });
    await tx.update({ processed: true });
    log.info(`DONE: https://bscscan.com/tx/${tx.hash}`);
  } catch (err) {
    if (
      err.message === "NO_ERC20_TRANSFER" ||
      err.message === "IGNORED_METHOD" ||
      err.message === "IGNORED_ADDRESS" ||
      err.message === "IGNORED_SIGN"
    ) {
      await tx.update({ processed: true });
      log.info(`Bo qua tx ${tx.hash}: ${err.message}`);
    } else {
      log.error(`Loi tx ${tx.hash}: ${err.message}`);
    }
  }
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();
  log.info("Bat dau xu ly transactions...");

  const loop = async () => {
    try {
      await processNext();
    } catch (err) {
      log.error(`Loi: ${err.message}`);
    }
    setTimeout(loop, 100);
  };

  loop();
}

main().catch((err) => log.error(err.message));
