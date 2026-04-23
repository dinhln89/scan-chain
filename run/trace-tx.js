const sequelize = require("../db");
const Transaction = require("../models/Transaction");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const BSC_RPC =
  process.env.BSC_RPC ||
  "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2";

async function traceCall(txHash) {
  const res = await fetch(BSC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "debug_traceTransaction",
      params: [txHash, { tracer: "callTracer" }],
    }),
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function getLogs(txHash) {
  const res = await fetch(BSC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result?.logs || [];
}

const SELECTORS = {
  '0x0902f1ac': 'getReserves()',
  '0x70a08231': 'balanceOf(address)',
};

function extractCalls(calls = [], results = []) {
  for (const call of calls) {
    const selector = call.input?.slice(0, 10)?.toLowerCase();
    if (selector && SELECTORS[selector]) {
      results.push({
        fn:     SELECTORS[selector],
        to:     call.to,
        input:  call.input,
        output: call.output,
      });
    }
    if (call.calls) extractCalls(call.calls, results);
  }
  return results;
}

function decodeGetReserves(output) {
  if (!output || output === '0x') return null;
  const hex = output.slice(2);
  const reserve0 = BigInt('0x' + hex.slice(0, 64));
  const reserve1 = BigInt('0x' + hex.slice(64, 128));
  return { reserve0: reserve0.toString(), reserve1: reserve1.toString() };
}

function decodeBalanceOf(output) {
  if (!output || output === '0x') return null;
  return BigInt('0x' + output.slice(2)).toString();
}

function extractAddressesFromInput(input) {
  if (!input || input.length < 10) return [];
  const data = input.slice(10); // bo 4 byte selector
  const addresses = [];
  for (let i = 0; i + 64 <= data.length; i += 64) {
    const chunk = data.slice(i, i + 64);
    // address: 12 byte zero padding + 20 byte address
    if (chunk.startsWith('000000000000000000000000')) {
      const addr = '0x' + chunk.slice(24);
      if (addr !== '0x0000000000000000000000000000000000000000') {
        addresses.push(addr);
      }
    }
  }
  return [...new Set(addresses)];
}

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function decodeTransfers(logs) {
  return logs
    .filter((log) => log.topics[0]?.toLowerCase() === TRANSFER_TOPIC)
    .map((log) => ({
      token:  log.address,
      from:   '0x' + log.topics[1].slice(26),
      to:     '0x' + log.topics[2].slice(26),
      amount: BigInt('0x' + log.data.slice(2)).toString(),
    }));
}

async function processTx(tx) {
  console.log(`  Hash  : https://bscscan.com/tx/${tx.hash}`);

  const addrs = extractAddressesFromInput(tx.input);
  console.log(`  Addresses in input: ${addrs.length}`);
  addrs.forEach((a) => console.log(`    ${a}`));

  const trace = await traceCall(tx.hash);

  const allCalls = [trace, ...(trace.calls || [])];
  const matched = extractCalls(allCalls);

  if (matched.length === 0) {
    console.log('  Khong co getReserves / balanceOf');
    return { trace };
  }

  matched.forEach((c, i) => {
    console.log(`  [${i}] ${c.fn} -> ${c.to}`);
    if (c.fn === 'getReserves()') {
      const r = decodeGetReserves(c.output);
      if (r) console.log(`       reserve0=${r.reserve0}  reserve1=${r.reserve1}`);
    } else if (c.fn === 'balanceOf(address)') {
      const wallet = '0x' + c.input.slice(34);
      const bal = decodeBalanceOf(c.output);
      console.log(`       wallet=${wallet}  balance=${bal}`);
    }
  });

  const logs = await getLogs(tx.hash);
  const transfers = decodeTransfers(logs);
  console.log(`  Transfers: ${transfers.length}`);
  transfers.forEach((t, i) => {
    console.log(`    [${i}] token=${t.token}`);
    console.log(`         from =${t.from}`);
    console.log(`         to   =${t.to}`);
    console.log(`         amount=${t.amount}`);
  });

  return { trace, matched, transfers };
}

async function processNext() {
  const tx = await Transaction.findOne({
    where: { processed: false },
    order: [
      ["blockNumber", "ASC"],
      ["id", "ASC"],
    ],
  });

  if (!tx) return;

  console.log(`\nXu ly tx: ${tx.hash}`);
  try {
    await processTx(tx);
    await tx.update({ processed: true });
    console.log(`  -> Done`);
  } catch (err) {
    console.error(`  -> Loi: ${err.message}`);
  }
}

async function main() {
  await sequelize.sync({ alter: true });
  console.log("Bat dau xu ly transactions...");

  const loop = async () => {
    try {
      await processNext();
    } catch (err) {
      console.error("Loi:", err.message);
    }
    setTimeout(loop, 100);
  };

  loop();
}

main().catch(console.error);
