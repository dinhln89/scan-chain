const { Op } = require("sequelize");
const sequelize = require("../db");
const Transaction = require("../models/Transaction");
const { syncAll, processTxData, buildRow } = require("../core/trace-tx-process");
const { append } = require("../core/sheets");
const { createLogger } = require("../core/logger");

const log = createLogger(__filename);

async function processTx(tx) {
  const result = await processTxData(tx);
  if (!result) return;

  const now = new Date();

  // Sheet4: contract có thể mint/transfer ERC20 và không revert khi simulate
  if (result.isTransferFromErc20 && result.simulateResult?.notRevert) {
    await append(
      [
        [
          tx.hash,
          `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
          `https://bscscan.com/tx/${tx.hash}`,
          result.symbol,
          "YES",
          result.selector ?? "",
          tx.blockNumber,
          now.toLocaleString(),
        ],
      ],
      { sheet: "Sheet4" },
    );
  }

  // Sheet1: isTransferSender hoặc phát hiện token trong pair
  if (result.isTransferSender || result.pairTokenSymbols.length > 0) {
    await append([buildRow(tx, result)], { sheet: "Sheet1" });
  }
}

// Lỗi có thể bỏ qua hoàn toàn (đánh processed=true, không retry)
const IGNORED_ERRORS = new Set([
  "NO_ERC20_TRANSFER",
  "IGNORED_METHOD",
  "IGNORED_ADDRESS",
  "IGNORED_SIGN",
  "IGNORED_V3_PATH",
]);

const MAX_RETRIES = 3;
// retryCount: map tx.id → số lần lỗi, tránh tx lỗi liên tục chiếm slot mãi
const retryCount = new Map();

async function processOne(tx) {
  const t0 = Date.now();
  log.info(`TX ${tx.hash}`);
  try {
    await processTx(tx);
    await tx.update({ processed: true });
    retryCount.delete(tx.id);
    log.info(`DONE ${tx.hash} (${Date.now() - t0}ms)`);
  } catch (err) {
    // Lỗi ignored hoặc revert: không có giá trị retry, đánh processed luôn
    if (IGNORED_ERRORS.has(err.message) || err.message?.toLowerCase().includes("revert")) {
      await tx.update({ processed: true });
      retryCount.delete(tx.id);
      return;
    }
    const count = (retryCount.get(tx.id) || 0) + 1;
    if (count >= MAX_RETRIES) {
      // Hết lượt retry: bỏ qua để không chặn queue
      await tx.update({ processed: true });
      retryCount.delete(tx.id);
      log.warn(`Bo qua tx ${tx.hash} sau ${MAX_RETRIES} lan loi: ${err.message}`);
    } else {
      retryCount.set(tx.id, count);
      log.error(`Loi tx ${tx.hash} (lan ${count}/${MAX_RETRIES}): ${err.message}`);
    }
  }
}

const CONCURRENCY = 10;
// inFlight: set tx.id đang xử lý — loại khỏi DB query để tránh fetch trùng
const inFlight = new Set();

async function scheduleBatch() {
  const slots = CONCURRENCY - inFlight.size;
  if (slots <= 0) return;

  const where = { processed: false };
  // Loại các tx đang xử lý dở khỏi query
  if (inFlight.size > 0) where.id = { [Op.notIn]: [...inFlight] };

  const txs = await Transaction.findAll({
    where,
    order: [["blockNumber", "ASC"], ["id", "ASC"]],
    limit: slots,
  });

  for (const tx of txs) {
    inFlight.add(tx.id);
    // Không await — fire & forget, inFlight được dọn khi xong hoặc lỗi
    processOne(tx).finally(() => inFlight.delete(tx.id));
  }
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();
  // Sync tất cả ignore data từ sheet 1 lần khi khởi động
  await syncAll();
  log.info("Bat dau xu ly transactions...");

  const loop = async () => {
    try {
      await scheduleBatch();
    } catch (err) {
      log.error(`Loi: ${err.message}`);
    }
    setTimeout(loop, 50);
  };

  loop();
}

main().catch((err) => log.error(err.message));
