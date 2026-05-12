require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const https = require("https");
const IgnoreAddress = require("./ignore-address");
const IgnoreMethod = require("./ignore-method");
const { sendMessage } = require("./telegram");

const ignoreSwap = {
  "0xfc1c1b21": "borrowTokenFromCollateral",
  "0xfb3bdb41": "swapETHForExactTokens(uint256,address[],address,uint256)",
  "0xfa461e33": "uniswapV3SwapCallback",
  "0xf305d719": "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
  "0xf2c42696": "dagSwapByOrderId(uint256,uint256,uint256,address,uint256)",
  "0xe8e33700": "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
  "0xded9382a": "removeLiquidityETHWithPermit(address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)",
  "0xd06ca61f": "getAmountsOut(uint256,address[])",
  "0xc45a0155": "factory()",
  "0xbaa2abde": "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
  "0xb6f9de95": "swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)",
  "0xaf2979eb": "removeLiquidityETHSupportingFeeOnTransferTokens(address,uint256,uint256,uint256,address,uint256)",
  "0xad615dec": "quote(uint256,uint256,uint256)",
  "0xad5c4648": "WETH()",
  "0x8803dbee": "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)",
  "0x85f8c259": "getAmountIn(uint256,uint256,uint256)",
  "0x7ff36ab5": "swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)",
  "0x791ac947": "swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
  "0x5c11d795": "swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
  "0x5b0d5984": "removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)",
  "0x4a25d94a": "swapTokensForExactETH(uint256,uint256,address[],address,uint256)",
  "0x38ed1739": "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
  "0x2195995c": "removeLiquidityWithPermit(address,address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)",
  "0x1f00ca74": "getAmountsIn(uint256,address[])",
  "0x18cbafe5": "swapExactETHForTokens(uint256,address[],address,uint256)",
  "0x128acb08": "swap",
  "0x054d50d4": "getAmountOut(uint256,uint256,uint256)",
  "0x02751cec": "removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
  "0x022c0d9f": "",
};

const IGNORE_SWAP_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1E6P0tLWMSiMIv7JNA3USpr-XAUeQp7OpzvFbJWesRQs/export?format=csv&gid=1458691919";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function syncIgnoreSwapFromSheet() {
  const csv = await fetchUrl(IGNORE_SWAP_SHEET_URL);
  let added = 0;
  for (const line of csv.split("\n")) {
    const m = line.trim().match(/^(0x[0-9a-fA-F]{8})(?:,(.*))?$/);
    if (!m) continue;
    const sel = m[1].toLowerCase();
    let comment = (m[2] ?? "").trim().replace(/^"|"$/g, "");
    if (!(sel in ignoreSwap)) {
      ignoreSwap[sel] = comment;
      added++;
    }
  }
  return added;
}

const BSC_RPC =
  process.env.BSC_RPC ||
  "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2";

let _rpcHandler = null;

function setRpcHandler(fn) {
  _rpcHandler = fn;
}

// Serialize tất cả RPC calls qua 1 queue với delay tối thiểu giữa mỗi call
const RPC_INTERVAL_MS = parseInt(process.env.RPC_INTERVAL_MS || "150", 10);
let _rpcChain = Promise.resolve();

function enqueueRpc(fn) {
  const result = _rpcChain.then(fn);
  _rpcChain = result.then(
    () => new Promise((r) => setTimeout(r, RPC_INTERVAL_MS)),
    () => new Promise((r) => setTimeout(r, RPC_INTERVAL_MS)),
  );
  return result;
}

async function rawRpc(method, params) {
  return enqueueRpc(async () => {
    const res = await fetch(BSC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  });
}

async function rpc(method, params) {
  if (_rpcHandler) return _rpcHandler(method, params);
  return rawRpc(method, params);
}

async function batchRpc(requests) {
  if (requests.length === 0) return [];
  if (_rpcHandler) {
    return Promise.all(requests.map((r) => _rpcHandler(r.method, r.params)));
  }
  return enqueueRpc(async () => {
    const res = await fetch(BSC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        requests.map((r, i) => ({
          jsonrpc: "2.0",
          id: i,
          method: r.method,
          params: r.params,
        })),
      ),
    });
    const json = await res.json();
    return json.map((r) => (r.error ? null : r.result));
  });
}

const SELECTORS = {
  "0x0902f1ac": "getReserves()",
  "0x70a08231": "balanceOf(address)",
};

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function extractCalls(calls = [], results = [], parentSelector = null) {
  for (const call of calls) {
    const selector = call.input?.slice(0, 10)?.toLowerCase();
    if (selector || SELECTORS[selector]) {
      results.push({
        selector,
        fn: selector in SELECTORS ? SELECTORS[selector] : selector,
        to: call.to,
        input: call.input,
        output: call.output,
        parentSelector,
      });
    }
    if (selector && !ignoreSwap[selector]) {
      if (call.calls) extractCalls(call.calls, results, selector);
    }
  }
  return results;
}

// V3 path: token(20) + fee(3) + token(20) [+ fee(3) + token(20) ...]
// Valid lengths: 43 (1-hop), 66 (2-hop), 89 (3-hop), 112 (4-hop)
const V3_PATH_LENGTHS = new Set([43, 66, 89, 112]);
const V3_VALID_FEES = new Set([100, 500, 2500, 3000, 10000]);

function hasV3PathInInput(input) {
  if (!input || input.length < 10) return false;
  const data = input.slice(10).toLowerCase();
  for (let i = 0; i + 64 <= data.length; i += 64) {
    const len = parseInt(data.slice(i, i + 64), 16);
    if (!V3_PATH_LENGTHS.has(len)) continue;
    const pathStart = i + 64;
    if (pathStart + len * 2 > data.length) continue;
    // fee is at byte 20 in the path (40 hex chars in)
    const fee = parseInt(data.slice(pathStart + 40, pathStart + 46), 16);
    if (V3_VALID_FEES.has(fee)) return true;
  }
  return false;
}

// Detect ECDSA signature in ABI-encoded input (2 formats):
// 1. Packed 65-byte bytes: length=0x41, then r(32)+s(32)+v(1)
// 2. ABI-separated: v as uint256 word (0x1b/0x1c), preceded by r and s (non-zero first bytes)
function hasSignatureInInput(input) {
  if (!input || input.length < 10) return false;
  const data = input.slice(10).toLowerCase();
  for (let i = 0; i + 64 <= data.length; i += 64) {
    const chunk = data.slice(i, i + 64);

    // Format 1: packed 65-byte bytes (length = 0x41) → r(32)+s(32)+v(1)
    if (
      chunk ===
      "0000000000000000000000000000000000000000000000000000000000000041"
    ) {
      const sigStart = i + 64;
      if (sigStart + 130 > data.length) continue;
      const v = parseInt(data.slice(sigStart + 128, sigStart + 130), 16);
      if (v === 0x1b || v === 0x1c) return true;
    }

    // Format 3: ERC-4337 66-byte bytes (length = 0x42) → 0x00+r(32)+s(32)+v(1)
    if (
      chunk ===
      "0000000000000000000000000000000000000000000000000000000000000042"
    ) {
      const sigStart = i + 64;
      if (sigStart + 132 > data.length) continue;
      if (data.slice(sigStart, sigStart + 2) !== "00") continue;
      const v = parseInt(data.slice(sigStart + 130, sigStart + 132), 16);
      if (v === 0x1b || v === 0x1c) return true;
    }

    // Format 2: ABI-separated v word (uint256 = 27 or 28)
    if (
      chunk ===
        "000000000000000000000000000000000000000000000000000000000000001b" ||
      chunk ===
        "000000000000000000000000000000000000000000000000000000000000001c"
    ) {
      if (i < 128) continue; // can't have r and s before this
      const r = data.slice(i - 128, i - 64);
      const s = data.slice(i - 64, i);
      // r and s first byte must be non-zero (high-entropy, not a padded address/number)
      if (r.slice(0, 2) !== "00" && s.slice(0, 2) !== "00") return true;
    }
  }
  return false;
}

function isLikelyAddress(chunk) {
  if (!chunk.startsWith("000000000000000000000000")) return false;
  const addrPart = chunk.slice(24);
  if (addrPart === "0".repeat(40)) return false;
  if (addrPart.startsWith("00000000")) return false;
  return true;
}

function extractAddressesFromInput(input) {
  if (!input || input.length < 10) return [];
  const data = input.slice(10);
  const addresses = [];
  for (let i = 0; i + 64 <= data.length; i += 64) {
    const chunk = data.slice(i, i + 64).toLowerCase();
    if (isLikelyAddress(chunk)) addresses.push("0x" + chunk.slice(24));
  }
  return [...new Set(addresses)];
}

function decodeGetReserves(output) {
  if (!output || output === "0x") return null;
  const hex = output.slice(2);
  return {
    reserve0: BigInt("0x" + hex.slice(0, 64)).toString(),
    reserve1: BigInt("0x" + hex.slice(64, 128)).toString(),
  };
}

function decodeBalanceOf(output) {
  if (!output || output === "0x") return null;
  return BigInt("0x" + output.slice(2)).toString();
}

function decodeTransfers(logs) {
  return logs
    .filter(
      (log) =>
        log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
        log.topics[1] &&
        log.topics[2],
    )
    .map((log) => ({
      token: log.address,
      from: "0x" + log.topics[1].slice(26),
      to: "0x" + log.topics[2].slice(26),
      amount: BigInt(
        "0x" + (!log.data || log.data === "0x" ? "0" : log.data.slice(2)),
      ).toString(),
    }));
}

function decodeErc20StringResult(result) {
  try {
    if (!result || result === "0x") return null;
    const hex = result.slice(2);
    const offset = parseInt(hex.slice(0, 64), 16) * 2;
    const length = parseInt(hex.slice(offset, offset + 64), 16) * 2;
    const strHex = hex.slice(offset + 64, offset + 64 + length);
    return Buffer.from(strHex, "hex").toString("utf8");
  } catch {
    return null;
  }
}

async function getErc20Name(tokenAddress) {
  const result = await rpc("eth_call", [
    { to: tokenAddress, data: "0x06fdde03" },
    "latest",
  ]);
  return decodeErc20StringResult(result);
}

const Token = require("../models/Token");

function makeCache(max = 5000) {
  const map = new Map();
  return {
    get: (k) => map.get(k),
    has: (k) => map.has(k),
    set: (k, v) => {
      if (map.size >= max) map.delete(map.keys().next().value);
      map.set(k, v);
    },
    clear: () => map.clear(),
  };
}

const _tokenCache = makeCache(5000);

async function getErc20Symbol(tokenAddress) {
  const addr = tokenAddress.toLowerCase();

  if (_tokenCache.has(addr)) return _tokenCache.get(addr);

  const cached = await Token.findByPk(addr);
  if (cached) {
    _tokenCache.set(addr, cached.symbol);
    return cached.symbol;
  }

  let symbol = null;
  try {
    const result = await rpc("eth_call", [
      { to: addr, data: "0x95d89b41" },
      "latest",
    ]);
    symbol = decodeErc20StringResult(result);
  } catch {
    // token reverts on symbol() — treat as null
  }
  await Token.upsert({ address: addr, symbol });
  _tokenCache.set(addr, symbol);
  return symbol;
}

// txData co the truyen tu DB de bo qua eth_getTransactionByHash
async function analyzeTx(txHash, txData = null) {
  const [receipt, fetchedTx] = await Promise.all([
    rpc("eth_getTransactionReceipt", [txHash]),
    txData ? Promise.resolve(null) : rpc("eth_getTransactionByHash", [txHash]),
  ]);

  const tx = txData || fetchedTx;
  const transfers = decodeTransfers(receipt?.logs || []);
  if (transfers.length === 0) throw new Error("NO_ERC20_TRANSFER");
  if (!tx) throw new Error("Khong tim thay tx: " + txHash);

  const ignoredAddrs = IgnoreAddress.getAll();
  const ignoredMethods = IgnoreMethod.getAll();
  const selector = tx.input?.slice(0, 10)?.toLowerCase();

  if (ignoredMethods.has(selector)) throw new Error("IGNORED_METHOD");
  if (hasSignatureInInput(tx.input)) throw new Error("IGNORED_SIGN");
  if (hasV3PathInInput(tx.input)) throw new Error("IGNORED_V3_PATH");
  if (ignoredAddrs.has(tx.from?.toLowerCase()))
    throw new Error("IGNORED_ADDRESS");
  if (tx.to && ignoredAddrs.has(tx.to.toLowerCase()))
    throw new Error("IGNORED_ADDRESS");

  const addresses = extractAddressesFromInput(tx.input);
  const sender = tx.from.toLowerCase();
  const inputSet = new Set(addresses.map((a) => a.toLowerCase()));

  const addersExcludeFrom = addresses.map((a) => a.toLowerCase());
  // .filter((a) => a !== sender);

  // tim cac transfer to den sender hoac input address
  const matchedTos = [
    ...new Set(
      transfers
        .map((t) => t.to.toLowerCase())
        .filter((to) => to === sender || inputSet.has(to)),
    ),
  ];
  const hasTransferInAddresses = transfers.some(
    (t) =>
      inputSet.has(t.from.toLowerCase()) || inputSet.has(t.to.toLowerCase()),
  );
  if (matchedTos.length === 0 && !hasTransferInAddresses)
    throw new Error("NO_ERC20_TRANSFER");

  const isTransferSender = transfers.some(
    (t) => t.from.toLowerCase() === sender,
  );

  const tokensSentToSender = [
    ...new Set(
      transfers
        .filter((t) => t.to.toLowerCase() === sender)
        .map((t) => t.token.toLowerCase()),
    ),
  ];

  let calls = [];
  let isCallInput = false;

  const trace = await rpc("debug_traceTransaction", [
    txHash,
    { tracer: "callTracer" },
  ]);
  calls = extractCalls([trace, ...(trace.calls || [])]);

  calls.forEach((c) => {
    if (c.fn === "getReserves()") c.decoded = decodeGetReserves(c.output);
    if (c.fn === "balanceOf(address)") {
      c.wallet = c.input?.length >= 34 ? "0x" + c.input.slice(34) : null;
      c.decoded = decodeBalanceOf(c.output);
    }
  });

  if (isTransferSender) {
    const callAddrs = calls.map((c) => c.to?.toLowerCase());
    if (callAddrs.includes(sender) || callAddrs.some((a) => inputSet.has(a))) {
      isCallInput = true;
    }
  }

  const addersExcludeFromSet = new Set(addersExcludeFrom);
  const isTransferFromErc20 = calls.some((c) => {
    if (!c.input?.toLowerCase().startsWith("0x23b872dd")) return false;
    const transferFromAddr = "0x" + c.input.slice(34, 74).toLowerCase();
    return addersExcludeFromSet.has(transferFromAddr);
  });

  return {
    addresses,
    calls,
    hasSignature: hasSignatureInInput(tx.input),
    isCallInput,
    isTransferFromErc20,
    isTransferSender,
    selector,
    transactionIndex: receipt.transactionIndex,
    transfers,
    txHash,
  };
}

const SIM_FROM = "0xff3f428583c15a5681584e9e5e86e270418ac4d3";

async function simulateTx(to, input, blockNumber, txIndex) {
  const block =
    blockNumber != null && txIndex != null
      ? {
          blockNumber: "0x" + Number(blockNumber).toString(16),
          transactionIndex: "0x" + Number(txIndex).toString(16),
        }
      : blockNumber != null
        ? "0x" + Number(blockNumber).toString(16)
        : "latest";
  try {
    const result = await rpc("eth_call", [
      { from: SIM_FROM, to, data: input, gasPrice: "0x0", gas: "0x5F5E100" },
      block,
    ]);
    return { error: null, notRevert: true, result: result || null };
  } catch (err) {
    if (!err.message?.toLowerCase().includes("revert")) {
      sendMessage(`❌ simulateTx error\n<code>${to}</code>\n${err.message}`);
    }
    return { error: err.message, notRevert: false, result: null };
  }
}

module.exports = {
  analyzeTx,
  makeCache,
  batchRpc,
  decodeTransfers,
  extractAddressesFromInput,
  extractCalls,
  getErc20Name,
  getErc20Symbol,
  hasSignatureInInput,
  hasV3PathInInput,
  rawRpc,
  rpc,
  setRpcHandler,
  simulateTx,
  syncIgnoreSwapFromSheet,
  tokenCache: _tokenCache,
};
