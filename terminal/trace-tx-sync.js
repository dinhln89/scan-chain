require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { Op } = require("sequelize");
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

const CONCURRENCY = 5;

async function main() {
  console.log("[1/4] Ket noi DB...");
  await sequelize.ensureDatabase();
  await sequelize.sync();

  console.log("[2/4] Doc Sheet1 va fetch DB...");
  const rows = await getRows({ sheet: "Sheet1" });
  const hashes = rows.map((r) => r[0]).filter((h) => h && h.startsWith("0x"));
  console.log(`  Tim thay ${hashes.length} txHash tren sheet`);

  const txs = await Transaction.findAll({ where: { hash: { [Op.in]: hashes } } });
  const txMap = new Map(txs.map((tx) => [tx.hash, tx]));
  const notInDb = hashes.filter((h) => !txMap.has(h)).length;
  const toProcess = hashes.filter((h) => txMap.has(h));
  console.log(`  Co trong DB: ${toProcess.length} | Thieu: ${notInDb}`);

  console.log(`[3/4] Re-trace ${toProcess.length} tx (CONCURRENCY=${CONCURRENCY})...`);
  let done = 0;
  let skipped = 0;
  let errors = 0;
  let idx = 0;

  async function worker() {
    while (idx < toProcess.length) {
      const i = idx++;
      const hash = toProcess[i];
      const tx = txMap.get(hash);
      try {
        const appended = await reTraceTx(tx);
        if (appended) {
          done++;
          console.log(`  [${i + 1}/${toProcess.length}] DONE: ${hash}`);
        } else {
          skipped++;
          console.log(`  [${i + 1}/${toProcess.length}] SKIP: ${hash}`);
        }
      } catch (err) {
        errors++;
        console.log(`  [${i + 1}/${toProcess.length}] ERROR: ${hash}: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`[4/4] Xong. Done=${done} Skipped=${skipped} Errors=${errors + notInDb}`);
  await sequelize.close();
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
