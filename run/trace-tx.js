const { Op } = require("sequelize");
const sequelize = require("../db");
const Contract = require("../models/Contract");
const Transaction = require("../models/Transaction");
const {
  analyzeTx,
  batchRpc,
  getErc20Symbol,
  simulateTx,
  syncIgnoreSwapFromSheet,
} = require("../core/trace");

const { append } = require("../core/sheets");
const { createLogger } = require("../core/logger");

const log = createLogger(__filename);

// Xác định địa chỉ nào trong balanceOfWallets là swap pair (LP pool).
// Ưu tiên kết quả từ trace (getReserves), fallback sang DB rồi mới gọi RPC.
async function resolveSwapPairs(balanceOfWallets, getReservesAddrs) {
  if (balanceOfWallets.length === 0) return [];

  // Địa chỉ gọi getReserves() trong trace → chắc chắn là pair
  const fromTrace = balanceOfWallets.filter((a) => getReservesAddrs.has(a));
  if (fromTrace.length > 0) {
    await Promise.all(
      fromTrace.map((a) => Contract.upsert({ address: a, isPair: true })),
    );
  }

  // Còn lại: kiểm tra DB trước, sau đó mới gọi RPC
  const notFromTrace = balanceOfWallets.filter((a) => !getReservesAddrs.has(a));

  const rows =
    notFromTrace.length > 0
      ? await Contract.findAll({
          where: { address: notFromTrace },
          attributes: ["address", "isPair"],
        })
      : [];
  const dbMap = new Map(rows.map((c) => [c.address, c.isPair]));

  const known = notFromTrace.filter((a) => dbMap.get(a) === true);
  const unknown = notFromTrace.filter((a) => !dbMap.has(a));

  if (unknown.length > 0) {
    // 0x0902f1ac = getReserves(); kết quả >= 194 chars nghĩa là trả về 3 uint112 → là pair
    const results = await batchRpc(
      unknown.map((addr) => ({
        method: "eth_call",
        params: [{ to: addr, data: "0x0902f1ac" }, "latest"],
      })),
    );
    await Promise.all(
      unknown.map((addr, i) => {
        const isPair = !!(
          results[i] &&
          results[i] !== "0x" &&
          results[i].length >= 194
        );
        return Contract.upsert({ address: addr, isPair });
      }),
    );
    known.push(
      ...unknown.filter(
        (_, i) =>
          !!(results[i] && results[i] !== "0x" && results[i].length >= 194),
      ),
    );
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

  // Bỏ qua tx không có ERC20 transfer liên quan
  if (!isTransferFromErc20 && !isTransferSender) return;

  // Token trả về cho người gọi (dùng để lấy symbol)
  const firstToSender = transfers.find(
    (t) => t.to.toLowerCase() === tx.from.toLowerCase(),
  );

  const getReservesAddrs = new Set(
    calls
      .filter((c) => c.fn === "getReserves()")
      .map((c) => c.to?.toLowerCase()),
  );
  const balanceOfWallets = [
    ...new Set(
      calls
        .filter((c) => c.fn === "balanceOf(address)" && c.wallet)
        .map((c) => c.wallet.toLowerCase()),
    ),
  ];

  // Chạy song song: lấy symbol, simulate, resolve pair — độc lập nhau
  const [symbol, simulateResult, swapPairWallets] = await Promise.all([
    firstToSender
      ? getErc20Symbol(firstToSender.token).then((s) => s || "")
      : Promise.resolve(""),
    isTransferFromErc20
      ? simulateTx(
          tx.to,
          tx.input,
          tx.blockNumber,
          tx.transactionIndex ?? transactionIndex,
        )
      : Promise.resolve(null),
    isTransferSender
      ? resolveSwapPairs(balanceOfWallets, getReservesAddrs)
      : Promise.resolve([]),
  ]);

  const now = new Date();

  // Sheet4: contract có thể mint/transfer ERC20 và không revert khi simulate
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

  // Sheet1: tx gửi token đến LP pair (dấu hiệu add liquidity hoặc swap tự viết)
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
    await processTx(tx, { from: tx.from, to: tx.to, input: tx.input });
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
  if (inFlight.size > 0) where.id = { [Op.notIn]: [...inFlight] };

  const txs = await Transaction.findAll({
    where,
    order: [
      ["blockNumber", "ASC"],
      ["id", "ASC"],
    ],
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
  // Sync ignoreSwap từ sheet 1 lần duy nhất khi khởi động, không sync lại trong loop
  await syncIgnoreSwapFromSheet();
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
