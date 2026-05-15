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

// Top 100 token BEP20 nổi tiếng trên BSC — không có giá trị signal trong inputCallAddrs
const WELL_KNOWN_TOKENS = new Set([
  // Stablecoins
  "0x55d398326f99059ff775485246999027b3197955", // USDT
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
  "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", // DAI
  "0x14016e85a25aeb13065688cafb43044c2ef86784", // TUSD
  "0x4bd17003473389a42daf6a0a729f6fdb328bbbd7", // VAI
  "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409", // FDUSD
  "0xd17479997f34dd9156deef8f95a52d81d265be9c", // USDD

  // Wrapped assets
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", // BTCB
  "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH
  "0x8ff795a6f4d97e7887c79bea79aba5cc76444add", // BCH
  "0x4338665cbb7b2485a8855a139b75d5e34ab0db94", // LTC
  "0x3d6545b08693dae087e957cb1180ee38b9e3c25e", // ETC

  // Top L1 (bridged)
  "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe", // XRP
  "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47", // ADA
  "0xba2ae424d960c26247dd6c32edc70b295c744c43", // DOGE
  "0x7083609fce4d1d8dc0c979aab8c869ea2c873402", // DOT
  "0xce7de646e7208a4ef112cb6ed5038fa6cc6b12e5", // TRX
  "0x570a5d26f7765ecb712c0924e4de545b89fd43df", // SOL
  "0x1ce0c2827e2ef14d5c4f29a091d735a204794041", // AVAX
  "0xcc42724c6683b7e57334c4e856f4c9965ed682bd", // MATIC
  "0xad29abb318791d579433d831ed122afeaf29dcfe", // FTM
  "0x1fa4a73a3f0133f0025378af00236f3abdee5d63", // NEAR
  "0x03ff0ff224f904be3118461335064bb48df47938", // ONE
  "0x0eb3a705fc54725037cc9e008bdede697f62f335", // ATOM
  "0x0d8ce2a99bb6e3b7db580ed848240e4a0f9ae153", // FIL
  "0x56b6fb708fc5732dec1afc8d8556423a2edccbd6", // EOS
  "0x9678e42cebeb63205a1a9ef264c08a2b94dede6e", // IOTX
  "0xa767f745331d267c7751297d982b050c93985627", // ALGO
  "0x25d2e80cb6b86881fd7e07dd263fb79f4abe033c", // KSM
  "0x43c934a845205f0b514417d757d7235b8f53f1b9", // XLM
  "0x6f400810b62df8e13fded51be75ff5393eaa841f", // EGLD
  "0xf21768ccbc73ea5b6fd3c687208a7c2d52f4f84c", // REEF

  // DeFi
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", // CAKE
  "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd", // LINK
  "0xbf5140a22578168fd562dccf235e5d43a02ce9b1", // UNI
  "0xfb6115445bff7b52feb98650c87f44907e58f802", // AAVE
  "0x52ce071bd9b1c4b00a0b92d298c512478cad67e8", // COMP
  "0x5f0da599bb2cccfcf6fdfd7d81743b6020864350", // MKR
  "0x9ac983826058b8a9c7aa1c9171441191232e8404", // SNX
  "0x88f1a5ae2a3bf98aeaf342d26b30a79438c9142e", // YFI
  "0x947950bcc74888a40ffa2593c5798f11beac330",  // SUSHI
  "0x111111111117dc0aa78b770fa6a738034120c302", // 1INCH
  "0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63", // XVS (Venus)
  "0x8f0528ce5ef7b51152a59745befdd91d97091d2f", // ALPACA
  "0xad6caeb32cd2c308980a548bd0bc5aa4306c6c18", // BAND
  "0xa2b726b1145a4773f68593cf171187d8ebe4d495", // INJ
  "0x47bead2563dcbf3bf2c9407fea4dc236faba485a", // SXP
  "0x9c65ab58d8d978db963e63f2bfb7121627e3a739", // MDX
  "0xca3f508b8e4dd382ee878a314789373d80a5190a", // BIFI (Beefy)
  "0xa7f552078dcc247c2684336020c03648500c6d9f", // EPS (Ellipsis)
  "0xa1faa113cbe53436df28ff0aee54275c13b40975", // ALPHA
  "0xd4cb328a82bdf5f03eb737f37fa6b370aef3e888", // CREAM
  "0x4b0f1812e5df2a09796481ff14017e6005508003", // TWT
  "0x20de22029ab63cf9a7cf5feb2b737ca1ee4c82a6", // CHESS
  "0x658a109c5900bc6d2357c87549b651670e5b0539", // FOR
  "0x8443f091997f06a61670b735ed52edd3d9c36a8",  // BEL
  "0xe02df9e3e622debdd69fb838bb799e3f168902c5", // BAKE

  // Gaming / NFT / Metaverse
  "0x715d400f88c167884bbcc41c5fea407ed4d2f8a0", // AXS
  "0x7ddee176f665cd201f93eede625770e2fd911990", // GALA
  "0x3019bf2a2ef8040c242c9a4c5d2a7e85e33f55e9", // GMT (STEPN)
  "0x4a2c860cec6471b9f5f5a336eb4f38bb21683c98", // GST (STEPN)
  "0x12bb890508c125661e03b09ec06e404bc9289040", // RACA
  "0x67b725d7e342d7b611fa85e859df9697d9378b2e", // SAND
  "0x26433c8127d9b4e9b71eaa15111df99ea2eeb2f8", // MANA
  "0xf9cec8d50f6c8ad3fb6dccec577e05aa32b224fe", // CHR

  // Meme
  "0x2859e4544c4bb03966803b044a93563bd2d0dd4a", // SHIB
  "0xfb5b838b6cfeedc2873ab27866079ac55363d37",  // FLOKI
  "0x8076c74c5e3f5852037f31ff0093eeb8c8add8d3", // SAFEMOON
  "0xae9269f27437f0fcbc232d39ec814844a51d6b8f", // BURGER

  // Other notable BSC
  "0xa184088a740c695e156f91f5cc086a06bb78b827", // AUTO
  "0xac51066d7bec65dc4589368da368b212745d63e8", // ALICE
  "0xa8c2b8eec3d368c0253ad3dae65a5f2bbb89c929", // CTK (Certik)
  "0xd41fdb03ba84762dd66a0af1a6c8540ff1ba5dfb", // SFP (SafePal)
  "0x67ee3cb086f8a16f34bee3ca72fad36f7db929e2", // DODO
  "0x762539b45a1dcce3d36d080f74d1aed37844b878", // LINA (Linear)
  "0x0112e557d400474717056c4e6d40dd6a85184779", // PHA (Phala)
  "0xb2bd0749dbe21f623d9baba856d3b0f0e1bfec9c", // DUSK
  "0xaec945e04baf28b135fa7c640f624f8d90f1c3a6", // C98 (Coin98)
  "0x5f4bde007dc06b867f86ebfe4802e2cf751a1f21", // HIGH
  "0xb86abcb37c3a4b64f74f59301aff131a1becc787", // ZIL
  "0x6f400810b62df8e13fded51be75ff5393eaa841f", // EGLD (dup, harmless)
  "0x8c851d1a123ff703bd1f9dedd29602eb1d19f93a", // BNX (BinaryX)
  "0xc0f33210d63e83f85c3d01f2d7cacd028f2e66ae", // HOT (Holo)
  "0xebd49b26169e1b52c04cfd19fcf289405df55f80", // ORBS
  "0x3203c9e46ca618c8c1ce5de11d7a8f8bfce59b9",  // MBOX (Mobox)
  "0x154a9f9cbd3449ad22fdae23044319d6ef2a1fab", // SKILL (CryptoBlades)
  "0xa2120b9e674d3fc3875f415a7df52e382f141225", // ATA (Automata)
  "0x90c97f71e18723b0cf0dfa30ee176ab653e89f40", // FRAX
  "0xbe1a001fe942f96eea22ba08783140b9dcc09d28", // BETA (Beta Finance)
  "0x9f589e3eabe42ebc94a44727b3f3531c0c877ef9", // TKO (Tokocrypto)
  "0xaf53d56ff99f1322515e54fdde93ff8b3b7dafd5", // PROM
  "0x8e17ed70334c87ece574c9d537b47256ae46e6e9", // WRX (WazirX)
  "0x3a9b6e4a30ecaa7e68196b900f1bb72b9da2a7a8", // CHZ (Chiliz)
  "0xbd86e7f41fd0fbe498ca14e0afd4e8cf5ee6fe61", // APE (ApeCoin)
  "0xdce07662ca8ebc241316a15b611c89711414dd1a", // OCEAN
  "0x4fa7163e153419e0e1064e418dd7a99314ed27b6", // SHPING
  "0x1ba42e5193dfa8b03d15dd1b86a3113bbbef8eeb", // ZEC (Zcash)
  "0x101d82428437127bf1608f699cd651e6abf9766e", // BAT
  "0x62d71b23bf15151a1ed97f7934a7d99e09a1cd9",  // OG (OG Fan Token)
  "0x23ce9e926048a4e719f68bfceb9b951ca3e3b1b",  // NCT (PolySwarm)
  "0x7ae8ea61a5d28c5cbbb65ac0f09f24f4abf0a0cb", // PERP (Perpetual Protocol)
  "0xf307910a4c7bbc79691fd374889b36d8531b08e3", // ANKR
  "0x3bf6060f0384b8f37a5228e5be9b26e5adc73f7a", // WING (Wing Finance)
  "0x949d48eca67b17269629c7194f4b727d4ef9e5d6", // MC (Merit Circle)
  "0x56b6fb708fc5732dec1afc8d8556423a2edccbd6", // EOS (dup, harmless)
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
    rows = notFromTrace.length > 0
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
          const isPair = !!(results[i] && results[i] !== "0x" && results[i].length >= 194);
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
    logs,
    transfers,
    isEcrecoverSender,
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

  // Chạy song song: simulate và resolve pair — độc lập nhau
  const [simulateResult, swapPairWallets] = await Promise.all([
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

  // Địa chỉ trong input tx mà có internal call gọi tới
  const inputAddrs = new Set(
    extractAddressesFromInput(tx.input).map((a) => a.toLowerCase()),
  );
  const calledFromInput = new Set(
    calls.map((c) => c.to?.toLowerCase()).filter((a) => a && inputAddrs.has(a)),
  );

  // Địa chỉ chỉ nhận fallback call (input rỗng/0x) → không có ý nghĩa signal
  const fallbackOnlyAddrs = new Set(
    [...calledFromInput].filter((addr) =>
      calls
        .filter((c) => c.to?.toLowerCase() === addr)
        .every((c) => !c.input || c.input === "0x"),
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
    .filter((a) => !WELL_KNOWN_TOKENS.has(a) && !fallbackOnlyAddrs.has(a))
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
  const symbol = firstToSender ? (allSymbols[0] || "") : "";
  const pairTokenSymbols = tokenAddrsOnPairs.map((addr, i) => allSymbols[symbolOffset + i] || addr);

  return {
    calls,
    transfers,
    isEcrecoverSender,
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
  row.push(result.selector ?? "", tx.blockNumber, now.toLocaleString());
  return row;
}

module.exports = { syncAll, resolveSwapPairs, processTxData, buildRow };
