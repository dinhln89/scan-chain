const sequelize = require("../db");
const Transaction = require("../models/Transaction");
const ReviewTx = require("../models/ReviewTx");
const { analyzeTx, batchRpc, getErc20Symbol, simulateTx } = require("../core/trace");
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
  } = await analyzeTx(tx.hash, txData);

  if (!isTransferFromErc20 && !isTransferSender) return;

  const firstToSender = transfers.find(
    (t) => t.to.toLowerCase() === tx.from.toLowerCase(),
  );
  const symbol = firstToSender
    ? (await getErc20Symbol(firstToSender.token) || "")
    : "";

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
            symbol,
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
    const balanceOfWallets = [
      ...new Set(
        calls
          .filter((c) => c.fn === "balanceOf(address)" && c.wallet)
          .map((c) => c.wallet.toLowerCase()),
      ),
    ];

    const swapPairWallets = await (async () => {
      if (balanceOfWallets.length === 0) return [];
      const results = await batchRpc(
        balanceOfWallets.map((addr) => ({
          method: "eth_call",
          params: [{ to: addr, data: "0x0902f1ac" }, "latest"],
        })),
      );
      return balanceOfWallets.filter(
        (_, i) => results[i] && results[i] !== "0x" && results[i].length >= 194,
      );
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
        symbol,
        isCallInput ? "YES" : "",
        swapPairWallets.length > 0 ? "YES" : "",
        selector ?? "",
        tx.blockNumber,
        now.toLocaleString(),
        simulatorNotRevert ? "OK" : "",
      ],
    ]);
  }
}

const IGNORED_ERRORS = new Set([
  "NO_ERC20_TRANSFER",
  "IGNORED_METHOD",
  "IGNORED_ADDRESS",
  "IGNORED_SIGN",
  "IGNORED_V3_PATH",
]);

const PARALLEL = 3;
const STAGGER_MS = 400;

async function processOne(tx) {
  try {
    await processTx(tx, { from: tx.from, to: tx.to, input: tx.input });
    await tx.update({ processed: true });
    log.info(`DONE: https://bscscan.com/tx/${tx.hash}`);
  } catch (err) {
    if (IGNORED_ERRORS.has(err.message)) {
      await tx.update({ processed: true });
    } else {
      log.error(`Loi tx ${tx.hash}: ${err.message}`);
    }
  }
}

async function processNext() {
  const txs = await Transaction.findAll({
    where: { processed: false },
    order: [
      ["blockNumber", "ASC"],
      ["id", "ASC"],
    ],
    limit: PARALLEL,
  });

  if (txs.length === 0) return;

  await Promise.all(
    txs.map(
      (tx, i) =>
        new Promise((r) => setTimeout(r, i * STAGGER_MS)).then(() =>
          processOne(tx),
        ),
    ),
  );
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
