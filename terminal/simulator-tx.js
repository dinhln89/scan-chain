require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const { rpc, simulateTx } = require("../core/trace");

async function main() {
  const txHash = process.argv[2];

  if (!txHash) {
    console.error("Usage: node terminal/simulator-tx.js <txHash>");
    process.exit(1);
  }

  console.log("Fetching tx...");
  const tx = await rpc("eth_getTransactionByHash", [txHash]);
  if (!tx) {
    console.error("Khong tim thay tx:", txHash);
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("TX      :", txHash);
  console.log("to      :", tx.to);
  console.log("block   :", tx.blockNumber);
  console.log("=".repeat(60));

  const { notRevert, result, error } = await simulateTx(tx.to, tx.input, parseInt(tx.blockNumber, 16));
  console.log("\nsimulatorNotRevert:", notRevert);
  if (result) console.log("result            :", result);
  if (error)  console.log("error             :", error);
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
