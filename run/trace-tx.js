const sequelize = require("../db");
const Transaction = require("../models/Transaction");
const ReviewTx = require("../models/ReviewTx");
const { analyzeTx, simulateTx, batchRpc } = require("../core/trace");
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
  } = await analyzeTx(tx.hash, txData);

  const tokenSymbolList = Object.values(tokenSymbols)
    .filter(Boolean)
    .join(", ");

  if (!isTransferFromErc20 && !isTransferSender) return;

  const { notRevert: simulatorNotRevert } = await simulateTx(
    tx.to,
    tx.input,
    tx.blockNumber,
  );

  if (isTransferFromErc20) {
    const now = new Date();
    if (simulatorNotRevert) {
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
          ],
        ],
        { sheet: "Sheet4" },
      );
    }
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
    const balanceOfWallets = [
      ...new Set(
        calls
          .filter((c) => c.fn === "balanceOf(address)" && c.wallet)
          .map((c) => c.wallet.toLowerCase()),
      ),
    ];

    const swapPairWallets = await (async () => {
      if (balanceOfWallets.length === 0) return [];
      const known = balanceOfWallets.filter((a) => getReservesAddrs.has(a));
      const unknown = balanceOfWallets.filter((a) => !getReservesAddrs.has(a));
      if (unknown.length === 0) return known;
      const results = await batchRpc(
        unknown.map((addr) => ({
          method: "eth_call",
          params: [{ to: addr, data: "0x0902f1ac" }, "latest"],
        })),
      );
      const confirmed = unknown.filter(
        (_, i) => results[i] && results[i] !== "0x" && results[i].length >= 194,
      );
      return [...known, ...confirmed];
    })();

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
        isCallInput ? "YES" : "",
        getReservesAddrs.size > 0 ? "YES" : "",
        swapPairWallets.length > 0 ? "YES" : "",
        selector ?? "",
        tx.blockNumber,
        now.toLocaleString(),
        simulatorNotRevert ? "OK" : "",
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

  try {
    await processTx(tx, { from: tx.from, to: tx.to, input: tx.input });
    await tx.update({ processed: true });
    log.info(`DONE: https://bscscan.com/tx/${tx.hash}`);
  } catch (err) {
    if (
      err.message === "NO_ERC20_TRANSFER" ||
      err.message === "IGNORED_METHOD" ||
      err.message === "IGNORED_ADDRESS" ||
      err.message === "IGNORED_SIGN" ||
      err.message === "IGNORED_V3_PATH"
    ) {
      await tx.update({ processed: true });
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
