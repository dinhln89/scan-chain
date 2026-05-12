const Contract = require("../models/Contract");
const IgnoreMethod = require("./ignore-method");
const {
  analyzeTx,
  batchRpc,
  extractAddressesFromInput,
  getErc20Symbol,
  simulateTx,
  syncIgnoreSwapFromSheet,
} = require("./trace");

// Gọi 1 lần khi khởi động — sync tất cả ignore data từ sheet
async function syncAll() {
  await IgnoreMethod.syncFromSheet();
  await syncIgnoreSwapFromSheet();
}

module.exports.syncAll = syncAll;

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
    // 0x0902f1ac = getReserves(); kết quả >= 194 chars → trả về 3 uint112 → là pair
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

// Phân tích tx và trả về object kết quả đầy đủ, hoặc null nếu không liên quan.
async function processTxData(tx) {
  const {
    calls,
    transfers,
    isTransferSender,
    isTransferFromErc20,
    selector,
    transactionIndex,
  } = await analyzeTx(tx.hash, { from: tx.from, to: tx.to, input: tx.input });

  if (!isTransferFromErc20 && !isTransferSender) return null;

  // Token trả về cho người gọi (dùng để lấy symbol)
  const firstToSender = transfers.find(
    (t) => t.to.toLowerCase() === tx.from.toLowerCase(),
  );

  const getReservesCalls = calls.filter((c) => c.fn === "getReserves()");
  const getReservesAddrs = new Set(
    getReservesCalls.map((c) => c.to?.toLowerCase()),
  );
  const getReservesParentSelectors = [
    ...new Set(getReservesCalls.map((c) => c.parentSelector).filter(Boolean)),
  ];
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

  // Lấy symbol của các token gọi balanceOf đến pair đã xác nhận
  const pairSet = new Set(swapPairWallets);

  // Bước 1: balanceOf calls đến swapPair → ứng viên token
  const swapPairBalanceOfs = new Set(
    calls
      .filter((c) => c.fn === "balanceOf(address)" && c.wallet && pairSet.has(c.wallet.toLowerCase()))
      .map((c) => c.to?.toLowerCase())
      .filter(Boolean),
  );

  // Bước 2: nếu có call 0x022c0d9f đến địa chỉ trong swapPairBalanceOfs → đó là pair, không phải token → loại ra
  for (const c of calls) {
    if (c.input?.slice(0, 10)?.toLowerCase() === "0x022c0d9f" && c.to) {
      swapPairBalanceOfs.delete(c.to.toLowerCase());
    }
  }

  // Bước 3: tokenAddrsOnPairs = swapPairBalanceOfs sau khi lọc
  const tokenAddrsOnPairs = [...swapPairBalanceOfs];
  const pairTokenSymbols = await Promise.all(
    tokenAddrsOnPairs.map((addr) =>
      getErc20Symbol(addr).then((s) => s || addr),
    ),
  );

  // Địa chỉ trong input tx mà có internal call gọi tới
  const inputAddrs = new Set(
    extractAddressesFromInput(tx.input).map((a) => a.toLowerCase()),
  );
  const inputCallAddrs = [
    ...new Set(
      calls
        .map((c) => c.to?.toLowerCase())
        .filter((a) => a && inputAddrs.has(a)),
    ),
  ]
    .map((a) => a.slice(0, 10))
    .join(", ");

  return {
    calls,
    isTransferSender,
    isTransferFromErc20,
    selector,
    symbol,
    simulateResult,
    swapPairWallets,
    pairTokenSymbols,
    getReservesParentSelectors,
    inputCallAddrs,
  };
}

// Tạo row cho Sheet1 (trace-tx) hoặc Sheet5 (trace-tx-sync)
function buildRow(tx, result, { includeSimulate = false } = {}) {
  const now = new Date();
  const row = [
    tx.hash,
    `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
    `https://bscscan.com/tx/${tx.hash}`,
    result.symbol,
    result.inputCallAddrs,
    result.getReservesParentSelectors.join(", "),
    result.pairTokenSymbols.join(", "),
  ];
  if (includeSimulate) {
    row.push(
      result.isTransferFromErc20 && result.simulateResult?.notRevert
        ? "YES"
        : "",
    );
  }
  row.push(result.selector ?? "", tx.blockNumber, now.toLocaleString());
  return row;
}

module.exports = { syncAll, resolveSwapPairs, processTxData, buildRow };
