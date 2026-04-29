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

async function rpc(method, params) {
  const res = await fetch(BSC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
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

async function decodeErc20String(tokenAddress, selector) {
  try {
    const result = await rpc("eth_call", [
      { to: tokenAddress, data: selector },
      "latest",
    ]);
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
  return decodeErc20String(tokenAddress, "0x06fdde03");
}

async function getErc20Symbol(tokenAddress) {
  return decodeErc20String(tokenAddress, "0x95d89b41");
}

async function analyzeTx(txHash) {
  const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
  const transfers = decodeTransfers(receipt?.logs || []);
  if (transfers.length === 0) throw new Error("NO_ERC20_TRANSFER");

  const [tx, trace] = await Promise.all([
    rpc("eth_getTransactionByHash", [txHash]),
    rpc("debug_traceTransaction", [txHash, { tracer: "callTracer" }]),
  ]);

  if (!tx) throw new Error("Khong tim thay tx: " + txHash);

  const ignoredAddrs = IgnoreAddress.getAll();
  const ignoredMethods = IgnoreMethod.getAll();
  const selector = tx.input?.slice(0, 10)?.toLowerCase();

  if (ignoredMethods.has(selector)) throw new Error("IGNORED_METHOD");
  if (ignoredAddrs.has(tx.from?.toLowerCase()))
    throw new Error("IGNORED_ADDRESS");
  if (tx.to && ignoredAddrs.has(tx.to.toLowerCase()))
    throw new Error("IGNORED_ADDRESS");

  const addresses = extractAddressesFromInput(tx.input);
  const calls = extractCalls([trace, ...(trace.calls || [])]);

  const sender = tx.from.toLowerCase();
  const inputSet = new Set(addresses.map((a) => a.toLowerCase()));

  // tim cac transfer to den sender hoac input address
  const matchedTos = [
    ...new Set(
      transfers
        .map((t) => t.to.toLowerCase())
        .filter((to) => to === sender || inputSet.has(to)),
    ),
  ];
  if (matchedTos.length === 0) throw new Error("NO_ERC20_TRANSFER");

  const tokensSentToSender = [
    ...new Set(
      transfers
        .filter((t) => t.to.toLowerCase() === sender)
        .map((t) => t.token.toLowerCase()),
    ),
  ];
  const tokenSymbols = await Promise.all(
    tokensSentToSender.map(async (addr) => [addr, await getErc20Symbol(addr)]),
  ).then(Object.fromEntries);

  calls.forEach((c) => {
    if (c.fn === "getReserves()") c.decoded = decodeGetReserves(c.output);
    if (c.fn === "balanceOf(address)") {
      c.wallet = c.input?.length >= 34 ? "0x" + c.input.slice(34) : null;
      c.decoded = decodeBalanceOf(c.output);
    }
  });

  let isCallInput = false;
  if (calls.length > 0) {
    const callAddrs = calls.map((c) => c.to?.toLowerCase());
    if (callAddrs.includes(sender) || callAddrs.some((a) => inputSet.has(a))) {
      isCallInput = true;
    }
  }

  let isTransferSender = false;
  const froms = transfers.map((t) => t.from.toLowerCase());
  if (froms.includes(sender)) {
    isTransferSender = true;
  }

  return {
    txHash,
    addresses,
    calls,
    transfers,
    isCallInput,
    isTransferSender,
    selector,
    tokenSymbols,
  };
}

module.exports = {
  analyzeTx,
  extractAddressesFromInput,
  extractCalls,
  decodeTransfers,
  getErc20Name,
  getErc20Symbol,
  rpc,
};
