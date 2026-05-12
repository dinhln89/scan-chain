require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const { Op } = require("sequelize");
const sequelize = require("../db");
const Transaction = require("../models/Transaction");
const {
  syncAll,
  processTxData,
  buildRow,
} = require("../core/trace-tx-process");
const { append, getRows } = require("../core/sheets");
const { createLogger } = require("../core/logger");

const log = createLogger(__filename);

const CONCURRENCY = 3;
const FLUSH_EVERY = 10;
const CUPS_DELAY = 2000;
const MAX_RETRIES = 5;

function isCupsError(err) {
  return (
    err.message?.includes("CUPS limit") ||
    err.message?.includes("rate limit") ||
    err.message?.includes("Too Many Requests")
  );
}

async function reTraceTx(tx) {
  const result = await processTxData(tx);
  if (!result) return null;
  return buildRow(tx, result, { includeSimulate: true });
}

async function reTraceTxWithRetry(tx) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await reTraceTx(tx);
    } catch (err) {
      if (isCupsError(err)) {
        const delay = CUPS_DELAY * attempt;
        console.log(
          `  CUPS limit, doi ${delay}ms roi thu lai (lan ${attempt}/${MAX_RETRIES})...`,
        );
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
  await syncAll();

  console.log("[2/4] Doc Sheet1 va fetch DB...");
  const rows = await getRows({ sheet: "Sheet1" });
  const hashes = rows.map((r) => r[0]).filter((h) => h && h.startsWith("0x"));
  console.log(`  Tim thay ${hashes.length} txHash tren sheet`);

  const txs = await Transaction.findAll({
    where: { hash: { [Op.in]: hashes } },
  });
  const txMap = new Map(txs.map((tx) => [tx.hash, tx]));
  const notInDb = hashes.filter((h) => !txMap.has(h)).length;
  const toProcess = hashes.filter((h) => txMap.has(h));
  console.log(`  Co trong DB: ${toProcess.length} | Thieu: ${notInDb}`);

  console.log(
    `[3/4] Re-trace ${toProcess.length} tx (CONCURRENCY=${CONCURRENCY}, flush moi ${FLUSH_EVERY} rows)...`,
  );
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
      console.log(
        `  => Flushed ${batch.length} rows vao Sheet5 (tong: ${totalDone})`,
      );
    } catch (err) {
      // Tra batch lai vao pending, khong mat du lieu
      pending.unshift(...batch);
      totalDone -= batch.length;
      console.log(
        `  => Flush ERROR (${batch.length} rows tra lai queue): ${err.message}`,
      );
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
        console.log(
          `  [${i + 1}/${toProcess.length}] ERROR: ${tx.hash}: ${err.message}`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await flush(true);

  console.log(
    `[4/4] Xong. Done=${totalDone} Skipped=${skipped} Errors=${errors + notInDb}`,
  );
  await sequelize.close();
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
