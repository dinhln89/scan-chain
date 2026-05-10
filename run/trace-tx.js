const sequelize = require("../db");
const Contract = require("../models/Contract");
const Transaction = require("../models/Transaction");
const { analyzeTx, batchRpc, getErc20Symbol, simulateTx } = require("../core/trace");

const { append } = require("../core/sheets");
const { createLogger } = require("../core/logger");

const log = createLogger(__filename);

async function resolveSwapPairs(balanceOfWallets, getReservesAddrs) {
  if (balanceOfWallets.length === 0) return [];

  // Từ trace: chắc chắn là pair
  const fromTrace = balanceOfWallets.filter((a) => getReservesAddrs.has(a));
  if (fromTrace.length > 0) {
    await Promise.all(fromTrace.map((a) => Contract.upsert({ address: a, isPair: true })));
  }

  // Không từ trace: DB → RPC
  const notFromTrace = balanceOfWallets.filter((a) => !getReservesAddrs.has(a));

  const rows = notFromTrace.length > 0
    ? await Contract.findAll({ where: { address: notFromTrace }, attributes: ["address", "isPair"] })
    : [];
  const dbMap = new Map(rows.map((c) => [c.address, c.isPair]));

  const known = notFromTrace.filter((a) => dbMap.get(a) === true);
  const unknown = notFromTrace.filter((a) => !dbMap.has(a));

  if (unknown.length > 0) {
    const results = await batchRpc(
      unknown.map((addr) => ({
        method: "eth_call",
        params: [{ to: addr, data: "0x0902f1ac" }, "latest"],
      })),
    );
    await Promise.all(
      unknown.map((addr, i) => {
        const isPair = !!(results[i] && results[i] !== "0x" && results[i].length >= 194);
        return Contract.upsert({ address: addr, isPair });
      }),
    );
    known.push(...unknown.filter((_, i) => !!(results[i] && results[i] !== "0x" && results[i].length >= 194)));
  }

  return [...fromTrace, ...known];
}

async function processTx(tx, txData) {
  const {
    calls,
    transfers,
    isCallInput,
    isTransferSender,
    isTransferFromErc20,
    selector,
    transactionIndex,
  } = await analyzeTx(tx.hash, txData);

  if (!isTransferFromErc20 && !isTransferSender) return;

  const firstToSender = transfers.find(
    (t) => t.to.toLowerCase() === tx.from.toLowerCase(),
  );

  const getReservesAddrs = new Set(
    calls.filter((c) => c.fn === "getReserves()").map((c) => c.to?.toLowerCase()),
  );
  const balanceOfWallets = [
    ...new Set(
      calls
        .filter((c) => c.fn === "balanceOf(address)" && c.wallet)
        .map((c) => c.wallet.toLowerCase()),
    ),
  ];

  const [symbol, simulateResult, swapPairWallets] = await Promise.all([
    firstToSender ? getErc20Symbol(firstToSender.token).then((s) => s || "") : Promise.resolve(""),
    isTransferFromErc20 ? simulateTx(tx.to, tx.input, tx.blockNumber, tx.transactionIndex ?? transactionIndex) : Promise.resolve(null),
    isTransferSender ? resolveSwapPairs(balanceOfWallets, getReservesAddrs) : Promise.resolve([]),
  ]);

  const now = new Date();

  if (isTransferFromErc20 && simulateResult?.notRevert) {
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

  if (isTransferSender) {
    await append([
      [
        tx.hash,
        `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
        `https://bscscan.com/tx/${tx.hash}`,
        symbol,
        isCallInput ? "YES" : "",
        getReservesAddrs.size > 0 ? "YES" : "",
        swapPairWallets.length > 0 ? "YES" : "",
        selector ?? "",
        tx.blockNumber,
        now.toLocaleString(),
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
