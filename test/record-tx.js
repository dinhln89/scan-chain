// Ghi lai tat ca RPC calls cua mot tx vao file fixture de dung cho sim-tx.js
// Usage: node test/record-tx.js <txHash>

const fs = require("fs");
const path = require("path");
const { analyzeTx, setRpcHandler, rawRpc } = require("../core/trace");

const txHash = process.argv[2];
if (!txHash) {
  console.error("Usage: node test/record-tx.js <txHash>");
  process.exit(1);
}

const fixture = { txHash, calls: {} };

setRpcHandler(async (method, params) => {
  const key = JSON.stringify([method, params]);
  const result = await rawRpc(method, params);
  fixture.calls[key] = result;
  console.log(`  recorded: ${method}`);
  return result;
});

async function main() {
  console.log(`Recording RPC calls for ${txHash}...`);
  try {
    const result = await analyzeTx(txHash);
    fixture.result = result;
    console.log(`isTransferSender: ${result.isTransferSender}`);
  } catch (err) {
    fixture.error = err.message;
    console.log(`analyzeTx threw: ${err.message}`);
  }

  const outPath = path.resolve(__dirname, "fixtures", `${txHash}.json`);
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(`\nSaved: ${outPath}`);
  console.log(`RPC calls recorded: ${Object.keys(fixture.calls).length}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
