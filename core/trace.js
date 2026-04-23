require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const BSC_RPC = process.env.BSC_RPC || 'https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2';

async function rpc(method, params) {
  const res = await fetch(BSC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

const SELECTORS = {
  '0x0902f1ac': 'getReserves()',
  '0x70a08231': 'balanceOf(address)',
};

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function extractCalls(calls = [], results = []) {
  for (const call of calls) {
    const selector = call.input?.slice(0, 10)?.toLowerCase();
    if (selector && SELECTORS[selector]) {
      results.push({ fn: SELECTORS[selector], to: call.to, input: call.input, output: call.output });
    }
    if (call.calls) extractCalls(call.calls, results);
  }
  return results;
}

function isLikelyAddress(chunk) {
  if (!chunk.startsWith('000000000000000000000000')) return false;
  const addrPart = chunk.slice(24);
  if (addrPart === '0'.repeat(40)) return false;
  if (addrPart.startsWith('00000000')) return false;
  return true;
}

function extractAddressesFromInput(input) {
  if (!input || input.length < 10) return [];
  const data = input.slice(10);
  const addresses = [];
  for (let i = 0; i + 64 <= data.length; i += 64) {
    const chunk = data.slice(i, i + 64).toLowerCase();
    if (isLikelyAddress(chunk)) addresses.push('0x' + chunk.slice(24));
  }
  return [...new Set(addresses)];
}

function decodeGetReserves(output) {
  if (!output || output === '0x') return null;
  const hex = output.slice(2);
  return {
    reserve0: BigInt('0x' + hex.slice(0, 64)).toString(),
    reserve1: BigInt('0x' + hex.slice(64, 128)).toString(),
  };
}

function decodeBalanceOf(output) {
  if (!output || output === '0x') return null;
  return BigInt('0x' + output.slice(2)).toString();
}

function decodeTransfers(logs) {
  return logs
    .filter((log) => log.topics[0]?.toLowerCase() === TRANSFER_TOPIC)
    .map((log) => ({
      token:  log.address,
      from:   '0x' + log.topics[1].slice(26),
      to:     '0x' + log.topics[2].slice(26),
      amount: BigInt('0x' + (log.data === '0x' ? '0' : log.data.slice(2))).toString(),
    }));
}

async function analyzeTx(txHash) {
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  const transfers = decodeTransfers(receipt?.logs || []);
  if (transfers.length === 0) throw new Error('NO_ERC20_TRANSFER');

  const [tx, trace] = await Promise.all([
    rpc('eth_getTransactionByHash', [txHash]),
    rpc('debug_traceTransaction', [txHash, { tracer: 'callTracer' }]),
  ]);

  if (!tx) throw new Error('Khong tim thay tx: ' + txHash);

  const addresses = extractAddressesFromInput(tx.input);
  const calls     = extractCalls([trace, ...(trace.calls || [])]);

  calls.forEach((c) => {
    if (c.fn === 'getReserves()') c.decoded = decodeGetReserves(c.output);
    if (c.fn === 'balanceOf(address)') {
      c.wallet  = '0x' + c.input.slice(34);
      c.decoded = decodeBalanceOf(c.output);
    }
  });

  return { txHash, addresses, calls, transfers };
}

module.exports = { analyzeTx, extractAddressesFromInput, extractCalls, decodeTransfers, rpc };
