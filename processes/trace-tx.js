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

async function processTx(tx) {
  console.log(`  Hash  : https://bscscan.com/tx/${tx.hash}`);
  const trace = await traceCall(tx.hash);
  console.log(`  Type  : ${trace.type}`);
  console.log(`  From  : ${trace.from}`);
  console.log(`  To    : ${trace.to}`);
  console.log(`  Gas   : ${trace.gasUsed}`);

  if (trace.calls && trace.calls.length > 0) {
    console.log(`  Calls : ${trace.calls.length} internal calls`);
    trace.calls.forEach((call, i) => {
      console.log(`    [${i}] ${call.type} -> ${call.to} (gas: ${call.gasUsed})`);
    });
  }

  const logs = await getLogs(tx.hash);
  console.log(`  Logs  : ${logs.length} events`);
  logs.forEach((log, i) => {
    console.log(`    [${i}] address : ${log.address}`);
    console.log(`         topic[0]: ${log.topics[0]}`);
  });

  return { trace, logs };
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
