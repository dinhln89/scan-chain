// Mo phong analyzeTx tu fixture da ghi truoc, khong can mang
// Usage: node test/sim-tx.js <txHash|fixture.json>

const fs = require("fs");
const path = require("path");
const { analyzeTx, setRpcHandler } = require("../core/trace");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node test/sim-tx.js <txHash|fixture.json>");
  process.exit(1);
}

// Accept both a raw hash and a path
const fixturePath = arg.endsWith(".json")
  ? path.resolve(arg)
  : path.resolve(__dirname, "fixtures", `${arg}.json`);

if (!fs.existsSync(fixturePath)) {
  console.error(`Fixture not found: ${fixturePath}`);
  console.error("Run first: node test/record-tx.js <txHash>");
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const callCounts = {};

setRpcHandler((method, params) => {
  const key = JSON.stringify([method, params]);
  if (!(key in fixture.calls)) {
    throw new Error(`RPC call not in fixture: ${method} ${JSON.stringify(params)}`);
  }
  callCounts[method] = (callCounts[method] || 0) + 1;
  return Promise.resolve(fixture.calls[key]);
});

async function main() {
  const txHash = fixture.txHash;
  console.log(`Simulating: ${txHash}`);
  console.log("=".repeat(60));

  let result;
  try {
    result = await analyzeTx(txHash);
  } catch (err) {
    console.log(`analyzeTx threw: ${err.message}`);
    if (fixture.error && fixture.error === err.message) {
      console.log("(matches recorded error)");
    }
    printCallCounts(callCounts);
    return;
  }

  const { addresses, calls, transfers, isTransferSender, selector, tokenSymbols } =
    result;

  console.log("isTransferSender:", isTransferSender);
  console.log("selector:        ", selector ?? "(none)");

  if (Object.keys(tokenSymbols).length > 0) {
    console.log("\n[Token Symbols]");
    for (const [addr, sym] of Object.entries(tokenSymbols)) {
      console.log(`  ${addr}  =>  ${sym ?? "(unknown)"}`);
    }
  }

  console.log("\n[Input Addresses]");
  if (addresses.length === 0) console.log("  (none)");
  addresses.forEach((a) => console.log(" ", a));

  console.log("\n[Trace Calls]");
  if (calls.length === 0) {
    console.log("  (none)");
  } else {
    calls.forEach((c, i) => {
      console.log(`  [${i}] ${c.fn} -> ${c.to}`);
      if (c.fn === "getReserves()" && c.decoded)
        console.log(`       reserve0=${c.decoded.reserve0}  reserve1=${c.decoded.reserve1}`);
      if (c.fn === "balanceOf(address)")
        console.log(`       wallet=${c.wallet}  balance=${c.decoded}`);
    });
  }

  console.log("\n[ERC20 Transfers]");
  if (transfers.length === 0) {
    console.log("  (none)");
  } else {
    transfers.forEach((t, i) => {
      console.log(`  [${i}] token=${t.token}`);
      console.log(`       from  =${t.from}`);
      console.log(`       to    =${t.to}`);
      console.log(`       amount=${t.amount}`);
    });
  }

  printCallCounts(callCounts);

  if (fixture.result) {
    const expected = fixture.result;
    const ok =
      expected.isTransferSender === isTransferSender;
    console.log(`\nKet qua khop voi fixture: ${ok ? "OK" : "KHAC"}`);
  }
}

function printCallCounts(counts) {
  console.log("\n[RPC calls dung trong simulation]");
  if (Object.keys(counts).length === 0) {
    console.log("  0 calls");
  } else {
    for (const [method, n] of Object.entries(counts)) {
      console.log(`  ${method}: ${n}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
