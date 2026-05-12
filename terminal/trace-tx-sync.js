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
  if (!isTransferFromErc20 && !isTransferSender) return null;

  const firstToSender = transfers.find((t) => t.to.toLowerCase() === tx.from.toLowerCase());
  const getReservesCalls = calls.filter((c) => c.fn === "getReserves()");
  const getReservesAddrs = new Set(getReservesCalls.map((c) => c.to?.toLowerCase()));
  const getReservesParentSelectors = [
    ...new Set(getReservesCalls.map((c) => c.parentSelector).filter(Boolean)),
  ];
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

  return [
    tx.hash,
    `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
    `https://bscscan.com/tx/${tx.hash}`,
    symbol,
    isCallInput ? "YES" : "",
    getReservesParentSelectors.join(","),
    swapPairWallets.length > 0 ? "YES" : "",
    isTransferFromErc20 && simulateResult?.notRevert ? "YES" : "",
    selector ?? "",
    tx.blockNumber,
    new Date().toLocaleString(),
  ];
}

const CONCURRENCY = 2;
const FLUSH_EVERY = 20;
const CUPS_DELAY = 2000;
const MAX_RETRIES = 5;

function isCupsError(err) {
  return err.message?.includes("CUPS limit") || err.message?.includes("rate limit") || err.message?.includes("Too Many Requests");
}

async function reTraceTxWithRetry(tx) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await reTraceTx(tx);
    } catch (err) {
      if (isCupsError(err)) {
        const delay = CUPS_DELAY * attempt;
        console.log(`  CUPS limit, doi ${delay}ms roi thu lai (lan ${attempt}/${MAX_RETRIES})...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Vuot qua ${MAX_RETRIES} lan thu lai vi CUPS limit`);
}

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

  console.log(`[3/4] Re-trace ${toProcess.length} tx (CONCURRENCY=${CONCURRENCY}, flush moi ${FLUSH_EVERY} rows)...`);
  let idx = 0;
  let skipped = 0;
  let errors = 0;
  let totalDone = 0;
  const pending = [];
  let flushing = false;

  async function flush(force = false) {
    if (flushing) return;
    if (!force && pending.length < FLUSH_EVERY) return;
    if (pending.length === 0) return;
    flushing = true;
    const batch = pending.splice(0, pending.length);
    try {
      await append(batch, { sheet: "Sheet5" });
      console.log(`  => Flushed ${batch.length} rows vao Sheet5 (tong: ${totalDone})`);
    } catch (err) {
      console.log(`  => Flush ERROR: ${err.message}`);
    }
    flushing = false;
  }

  async function worker() {
    while (idx < toProcess.length) {
      const i = idx++;
      const tx = txMap.get(toProcess[i]);
      try {
        const row = await reTraceTxWithRetry(tx);
        if (row) {
          pending.push(row);
          totalDone++;
          console.log(`  [${i + 1}/${toProcess.length}] DONE: ${tx.hash}`);
          await flush();
        } else {
          skipped++;
          console.log(`  [${i + 1}/${toProcess.length}] SKIP: ${tx.hash}`);
        }
      } catch (err) {
        errors++;
        console.log(`  [${i + 1}/${toProcess.length}] ERROR: ${tx.hash}: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await flush(true);

  console.log(`[4/4] Xong. Done=${totalDone} Skipped=${skipped} Errors=${errors + notInDb}`);
  await sequelize.close();
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
