const Contract = require("../models/Contract");
const IgnoreMethod = require("./ignore-method");
const {
  analyzeTx,
  batchRpc,
  extractAddressesFromInput,
  getErc20SymbolBatch,
  simulateTx,
  syncIgnoreSwap,
} = require("./trace");

// Top 20 token mỗi chain — không có giá trị signal trong inputCallAddrs
const WELL_KNOWN_TOKENS = new Set([
  // BSC top 20
  "0x55d398326f99059ff775485246999027b3197955", // USDT
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", // BTCB
  "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH (bridged)
  "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409", // FDUSD
  "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", // DAI
  "0x14016e85a25aeb13065688cafb43044c2ef86784", // TUSD
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", // CAKE
  "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe", // XRP
  "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47", // ADA
  "0xba2ae424d960c26247dd6c32edc70b295c744c43", // DOGE
  "0xcc42724c6683b7e57334c4e856f4c9965ed682bd", // MATIC
  "0x570a5d26f7765ecb712c0924e4de545b89fd43df", // SOL
  "0x7083609fce4d1d8dc0c979aab8c869ea2c873402", // DOT
  "0xce7de646e7208a4ef112cb6ed5038fa6cc6b12e5", // TRX
  "0x1ce0c2827e2ef14d5c4f29a091d735a204794041", // AVAX
  "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd", // LINK
  "0xbf5140a22578168fd562dccf235e5d43a02ce9b1", // UNI

  // ETH mainnet top 20
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", // stETH
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", // wstETH
  "0x514910771af9ca656af840dff83e8264ecf986ca", // LINK
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", // UNI
  "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", // SHIB
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", // AAVE
  "0x6982508145454ce325ddbe47a25d4ec3d2311933", // PEPE
  "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", // MKR
  "0xb50721bcf8d664c30412cfbc6cf7a15145234ad1", // ARB
  "0x5a98fcbea516cf06857215779fd812ca3bef1b32", // LDO
  "0xd533a949740bb3306d119cc777fa900ba034cd52", // CRV
  "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0", // MATIC/POL
  "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f", // SNX
  "0xc00e94cb662c3520282e6f5717214004a7f26888", // COMP
  "0x111111111117dc0aa78b770fa6a738034120c302", // 1INCH
]);

// Selector view-only của ERC20, SwapPair, SwapRouter — không có signal
const VIEW_ONLY_SELECTORS = new Set([
  // ERC20 view
  "0x70a08231", // balanceOf(address)
  "0x18160ddd", // totalSupply()
  "0xdd62ed3e", // allowance(address,address)
  "0x313ce567", // decimals()
  "0x06fdde03", // name()
  "0x95d89b41", // symbol()
  // SwapPair view
  "0x0902f1ac", // getReserves()
  "0x0dfe1681", // token0()
  "0xd21220a7", // token1()
  "0x5909c0d5", // price0CumulativeLast()
  "0x5a3d5493", // price1CumulativeLast()
  "0x7464fc3d", // kLast()
  "0x017e7e58", // token0() (alt encoding some pairs)
  // SwapRouter / Factory view
  "0xd06ca61f", // getAmountsOut(uint256,address[])
  "0x1f00ca74", // getAmountsIn(uint256,address[])
  "0xad615dec", // quote(uint256,uint256,uint256)
  "0xad5c4648", // WETH()
  "0xc45a0155", // factory()
  "0xe6a43905", // getPair(address,address)
  // Uniswap V3 pool view
  "0x3850c7bd", // slot0()
  "0x1a686502", // liquidity()
  "0xddca3f43", // fee()
  "0x70cf754a", // feeGrowthGlobal0X128()
  "0x46141319", // feeGrowthGlobal1X128()
]);

// Gọi 1 lần khi khởi động — sync tất cả ignore data từ sheet
async function syncAll() {
  await IgnoreMethod.syncFromSheet();
  // Rebuild ignoreSwap (dùng trong extractCalls) từ IgnoreMethod đã sync
  syncIgnoreSwap();
}

module.exports.syncAll = syncAll;

// Xác định địa chỉ nào trong balanceOfWallets là swap pair (LP pool).
// Ưu tiên kết quả từ trace (getReserves), fallback sang DB rồi mới gọi RPC.
async function resolveSwapPairs(balanceOfWallets, getReservesAddrs) {
  if (balanceOfWallets.length === 0) return [];

  // Địa chỉ gọi getReserves() trong trace → chắc chắn là pair
  const fromTrace = balanceOfWallets.filter((a) => getReservesAddrs.has(a));
  try {
    if (fromTrace.length > 0) {
      await Promise.all(
        fromTrace.map((a) => Contract.upsert({ address: a, isPair: true })),
      );
    }
  } catch {
    // DB không khả dụng → bỏ qua upsert, vẫn dùng fromTrace
  }

  // Còn lại: kiểm tra DB trước, sau đó mới gọi RPC
  const notFromTrace = balanceOfWallets.filter((a) => !getReservesAddrs.has(a));
  let rows = [];
  try {
    rows =
      notFromTrace.length > 0
        ? await Contract.findAll({
            where: { address: notFromTrace },
            attributes: ["address", "isPair"],
          })
        : [];
  } catch {
    // DB không khả dụng → bỏ qua, xử lý tất cả qua RPC
  }
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
    try {
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
    } catch {
      // DB không khả dụng → bỏ qua upsert
    }
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
    delegateCalls,
    logs,
    transfers,
    isEcrecoverSender,
    isTransferSender,
    isTransferFromErc20,
    isTransferFromErc20ExclSender,
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

  // Chạy song song: simulate và resolve pair — độc lập nhau
  const [simulateResult, swapPairWallets] = await Promise.all([
    isTransferFromErc20
      ? simulateTx(
          tx.to,
          tx.input,
          tx.blockNumber,
          tx.transactionIndex ?? transactionIndex,
          tx.gas,
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
      .filter(
        (c) =>
          c.fn === "balanceOf(address)" &&
          c.wallet &&
          pairSet.has(c.wallet.toLowerCase()),
      )
      .map((c) => c.to?.toLowerCase())
      .filter(Boolean),
  );

  // Địa chỉ trong input tx mà có internal call gọi tới
  const inputAddrs = new Set(
    extractAddressesFromInput(tx.input).map((a) => a.toLowerCase()),
  );
  const calledFromInput = new Set(
    calls.map((c) => c.to?.toLowerCase()).filter((a) => a && inputAddrs.has(a)),
  );

  // Địa chỉ chỉ nhận fallback hoặc view-only calls → không có signal
  const noSignalAddrs = new Set(
    [...calledFromInput].filter((addr) =>
      calls
        .filter((c) => c.to?.toLowerCase() === addr)
        .every((c) => {
          if (!c.input || c.input === "0x") return true;
          const sel = c.input.slice(0, 10).toLowerCase();
          return VIEW_ONLY_SELECTORS.has(sel);
        }),
    ),
  );

  // Map address → selector đầu tiên được gọi (dùng cho inputCallAddrs display)
  const firstSelectorByAddr = new Map();
  for (const c of calls) {
    const addr = c.to?.toLowerCase();
    if (addr && c.selector && !firstSelectorByAddr.has(addr)) {
      firstSelectorByAddr.set(addr, c.selector);
    }
  }

  const inputCallAddrs = [...calledFromInput]
    .filter((a) => !WELL_KNOWN_TOKENS.has(a) && !noSignalAddrs.has(a))
    .map((a) => {
      const sel = firstSelectorByAddr.get(a);
      return sel ? `${a.slice(0, 10)} => ${sel}` : a.slice(0, 10);
    })
    .join(", ");

  // Bước 2: loại khỏi swapPairBalanceOfs nếu:
  //   - token address emit Sync → thực ra là pair, không phải token
  //   - PAIR (c.wallet) emit Sync → balanceOf là internal của swap, không phải discovery
  //   - địa chỉ đó đã là confirmed pair
  //   - địa chỉ đó nằm trong inputAddrs (explicit parameter, không cần discover)
  //   - balanceOf của nó có parentSelector nằm trong getReservesParentSelectors
  //     (cùng hàm DEX nội bộ với getReserves → không phải discovery từ ngoài)
  const SYNC_TOPICS = new Set([
    "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1", // V2 Sync
    "0xcf2aa50876cdfbb541206f89af0ee78d44a2abf8d328e37fa4917f982149848a", // V3 Sync
  ]);
  const syncEmitters = new Set(
    logs
      .filter((l) => SYNC_TOPICS.has(l.topics?.[0]?.toLowerCase()))
      .map((l) => l.address?.toLowerCase())
      .filter(Boolean),
  );
  const getReservesParentSet = new Set(getReservesParentSelectors);

  // token địa chỉ emit Sync → là pair
  for (const addr of syncEmitters) {
    swapPairBalanceOfs.delete(addr);
  }
  // pair (c.wallet) emit Sync → token này là reserve của swap, không cần discover
  for (const c of calls) {
    if (
      c.fn === "balanceOf(address)" &&
      c.wallet &&
      syncEmitters.has(c.wallet.toLowerCase()) &&
      c.to
    ) {
      swapPairBalanceOfs.delete(c.to.toLowerCase());
    }
  }
  for (const addr of pairSet) {
    swapPairBalanceOfs.delete(addr);
  }
  for (const addr of inputAddrs) {
    swapPairBalanceOfs.delete(addr);
  }
  for (const c of calls) {
    if (
      c.fn === "balanceOf(address)" &&
      c.wallet &&
      pairSet.has(c.wallet.toLowerCase()) &&
      c.to &&
      getReservesParentSet.has(c.parentSelector)
    ) {
      swapPairBalanceOfs.delete(c.to.toLowerCase());
    }
  }

  // Bước 3: tokenAddrsOnPairs = swapPairBalanceOfs sau khi lọc
  const tokenAddrsOnPairs = [...swapPairBalanceOfs];

  // Batch tất cả symbol lookups: firstToSender + tokenAddrsOnPairs = 1 batchRpc thay vì N calls
  const symbolAddrs = [
    ...(firstToSender ? [firstToSender.token] : []),
    ...tokenAddrsOnPairs,
  ];
  const allSymbols = await getErc20SymbolBatch(symbolAddrs);
  const symbolOffset = firstToSender ? 1 : 0;
  const symbol = firstToSender ? allSymbols[0] || "" : "";
  const pairTokenSymbols = tokenAddrsOnPairs.map(
    (addr, i) => allSymbols[symbolOffset + i] || addr,
  );

  return {
    calls,
    delegateCalls,
    transfers,
    isEcrecoverSender,
    isTransferSender,
    isTransferFromErc20,
    isTransferFromErc20ExclSender,
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
function buildRow(tx, result, { includeSimulate = false, chain = "BSC" } = {}) {
  const now = new Date();
  const scanBase = chain === "ETH" ? "etherscan.io" : "bscscan.com";
  const row = [
    tx.hash,
    chain,
    `https://${scanBase}/address/${tx.to?.toLowerCase()}`,
    `https://${scanBase}/tx/${tx.hash}`,
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
  const sameFromTo =
    tx.from?.toLowerCase() === tx.to?.toLowerCase() ? "SAME_FROM" : "";
  row.push(
    sameFromTo,
    result.selector ?? "",
    tx.blockNumber,
    now.toLocaleString(),
  );
  return row;
}

module.exports = { syncAll, resolveSwapPairs, processTxData, buildRow };
