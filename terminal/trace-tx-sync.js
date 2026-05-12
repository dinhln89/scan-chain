require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const sequelize = require("../db");
const Contract = require("../models/Contract");
const Transaction = require("../models/Transaction");
const { analyzeTx, batchRpc, getErc20Symbol, simulateTx } = require("../core/trace");
const { append, getRows } = require("../core/sheets");
const { createLogger } = require("../core/logger");

const log = createLogger(__filename);

async function resolveSwapPairs(balanceOfWallets, getReservesAddrs) {
  if (balanceOfWallets.length === 0) return [];

  const fromTrace = balanceOfWallets.filter((a) => getReservesAddrs.has(a));
  if (fromTrace.length > 0) {
    await Promise.all(fromTrace.map((a) => Contract.upsert({ address: a, isPair: true })));
  }

  const notFromTrace = balanceOfWallets.filter((a) => !getReservesAddrs.has(a));
  const rows = notFromTrace.length > 0
    ? await Contract.findAll({ where: { address: notFromTrace }, attributes: ["address", "isPair"] })
    : [];
  const dbMap = new Map(rows.map((c) => [c.address, c.isPair]));

  const known = notFromTrace.filter((a) => dbMap.get(a) === true);
  const unknown = notFromTrace.filter((a) => !dbMap.has(a));

  if (unknown.length > 0) {
    const results = await batchRpc(
      unknown.map((addr) => ({ method: "eth_call", params: [{ to: addr, data: "0x0902f1ac" }, "latest"] })),
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

async function reTraceTx(tx) {
  const {
    calls,
    transfers,
    isCallInput,
    isTransferSender,
    isTransferFromErc20,
    selector,
    transactionIndex,
  } = await analyzeTx(tx.hash, { from: tx.from, to: tx.to, input: tx.input });

  if (!isTransferFromErc20 && !isTransferSender) return false;

  const firstToSender = transfers.find((t) => t.to.toLowerCase() === tx.from.toLowerCase());
  const getReservesAddrs = new Set(
    calls.filter((c) => c.fn === "getReserves()").map((c) => c.to?.toLowerCase()),
  );
  const balanceOfWallets = [
    ...new Set(calls.filter((c) => c.fn === "balanceOf(address)" && c.wallet).map((c) => c.wallet.toLowerCase())),
  ];

  const [symbol, simulateResult, swapPairWallets] = await Promise.all([
    firstToSender ? getErc20Symbol(firstToSender.token).then((s) => s || "") : Promise.resolve(""),
    isTransferFromErc20
      ? simulateTx(tx.to, tx.input, tx.blockNumber, tx.transactionIndex ?? transactionIndex)
      : Promise.resolve(null),
    isTransferSender ? resolveSwapPairs(balanceOfWallets, getReservesAddrs) : Promise.resolve([]),
  ]);

  const now = new Date();

  await append(
    [
      [
        tx.hash,
        `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
        `https://bscscan.com/tx/${tx.hash}`,
        symbol,
        isCallInput ? "YES" : "",
        getReservesAddrs.size > 0 ? "YES" : "",
        swapPairWallets.length > 0 ? "YES" : "",
        isTransferFromErc20 && simulateResult?.notRevert ? "YES" : "",
        selector ?? "",
        tx.blockNumber,
        now.toLocaleString(),
      ],
    ],
    { sheet: "Sheet5" },
  );

  return true;
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();

  log.info("Doc danh sach txHash tu Sheet1...");
  const rows = await getRows({ sheet: "Sheet1" });
  const hashes = rows.map((r) => r[0]).filter((h) => h && h.startsWith("0x"));
  log.info(`Tim thay ${hashes.length} txHash`);

  let done = 0;
  let skipped = 0;
  let errors = 0;

  for (const hash of hashes) {
    const tx = await Transaction.findOne({ where: { hash } });
    if (!tx) {
      log.warn(`Khong co trong DB: ${hash}`);
      skipped++;
      continue;
    }
    try {
      const appended = await reTraceTx(tx);
      if (appended) {
        done++;
        log.info(`[${done}/${hashes.length}] DONE: ${hash}`);
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      log.error(`Loi ${hash}: ${err.message}`);
    }
  }

  log.info(`Xong. Done=${done} Skipped=${skipped} Errors=${errors}`);
  await sequelize.close();
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
