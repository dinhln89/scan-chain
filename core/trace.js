require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const IgnoreAddress = require("./ignore-address");
const IgnoreMethod = require("./ignore-method");

const ignoreSwap = {
  "0x8803dbee":
    "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
  "0x18cbafe5": "swapExactETHForTokens(uint256,address[],address,uint256)",
  "0x7ff36ab5":
    "swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)",
  "0x38ed1739":
    "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
  "0x5c11d795":
    "swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
  "0xf2c42696": "dagSwapByOrderId(uint256,uint256,uint256,address,uint256)",
  "0xfc1c1b21": "borrowTokenFromCollateral",
  "0x128acb08": "swap",
  "0xfa461e33": "uniswapV3SwapCallback",
  "0x022c0d9f": "",
};

const BSC_RPC =
  process.env.BSC_RPC ||
  "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2";

let _rpcHandler = null;

function setRpcHandler(fn) {
  _rpcHandler = fn;
}

async function rawRpc(method, params) {
  const res = await fetch(BSC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
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
}

const SELECTORS = {
  "0x0902f1ac": "getReserves()",
  "0x70a08231": "balanceOf(address)",
};

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function extractCalls(calls = [], results = []) {
  for (const call of calls) {
    const selector = call.input?.slice(0, 10)?.toLowerCase();
    if (selector || SELECTORS[selector]) {
      results.push({
        selector,
        fn: selector in SELECTORS ? SELECTORS[selector] : selector,
        to: call.to,
        input: call.input,
        output: call.output,
      });
    }
    if (selector && !ignoreSwap[selector]) {
      if (call.calls) extractCalls(call.calls, results);
    }
  }
  return results;
}

// Detect 65-byte ECDSA signature (r+s+v) in ABI-encoded input
function hasSignatureInInput(input) {
  if (!input || input.length < 10) return false;
  const data = input.slice(10).toLowerCase();
  for (let i = 0; i + 64 <= data.length; i += 64) {
    const chunk = data.slice(i, i + 64);
    if (
      chunk ===
      "0000000000000000000000000000000000000000000000000000000000000041"
    ) {
      const sigStart = i + 64;
      if (sigStart + 130 > data.length) continue;
      const v = parseInt(data.slice(sigStart + 128, sigStart + 130), 16);
      if (v === 0x1b || v === 0x1c) return true;
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

async function getErc20Symbol(tokenAddress) {
  const result = await rpc("eth_call", [
    { to: tokenAddress, data: "0x95d89b41" },
    "latest",
  ]);
  return decodeErc20StringResult(result);
}

async function batchGetErc20Symbols(tokenAddresses) {
  const results = await batchRpc(
    tokenAddresses.map((addr) => ({
      method: "eth_call",
      params: [{ to: addr, data: "0x95d89b41" }, "latest"],
    })),
  );
  return Object.fromEntries(
    tokenAddresses.map((addr, i) => [
      addr,
      decodeErc20StringResult(results[i]),
    ]),
  );
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

  // Round 2: fetch trace; batch symbol lookups only when needed
  let calls = [];
  let tokenSymbols = {};
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
    tokenSymbols = await batchGetErc20Symbols(tokensSentToSender);

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
    txHash,
    addresses,
    calls,
    transfers,
    isCallInput,
    isTransferSender,
    isTransferFromErc20,
    selector,
    tokenSymbols,
    hasSignature: hasSignatureInInput(tx.input),
  };
}

module.exports = {
  analyzeTx,
  extractAddressesFromInput,
  extractCalls,
  decodeTransfers,
  hasSignatureInInput,
  getErc20Name,
  getErc20Symbol,
  batchGetErc20Symbols,
  rpc,
  rawRpc,
  batchRpc,
  setRpcHandler,
};
