require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const sequelize = require("../db");
const { rpc, rawRpcEth, setRpcHandler, extractAddressesFromInput } = require("../core/trace");
const { syncAll, processTxData, buildRow } = require("../core/trace-tx-process");

async function tryConnectDb() {
  try {
    await sequelize.ensureDatabase();
    await sequelize.sync();
    return true;
  } catch {
    console.warn("  [warn] DB khong ket noi duoc — resolveSwapPairs se bi skip");
    return false;
  }
}

async function main() {
  const txHash = process.argv[2] || "0x6a4cdaf641bd1b0c5254cd33171e0a750b5cd88c8afa88264ff0d21a2969267a";

  await tryConnectDb();
  await syncAll();

  console.log("\n[TX] Fetching:", txHash);

  // Uu tien BSC, neu khong co thi thu ETH
  let txData = await rpc("eth_getTransactionByHash", [txHash]);
  let chain = "BSC";
  if (!txData) {
    console.log("  [BSC] Khong tim thay, thu ETH...");
    txData = await rawRpcEth("eth_getTransactionByHash", [txHash]);
    chain = "ETH";
    if (txData) setRpcHandler(rawRpcEth);
  }
  if (!txData) {
    console.error("Khong tim thay tx tren BSC lan ETH:", txHash);
    process.exit(1);
  }
  console.log("  chain       :", chain);

  const tx = {
    hash: txData.hash,
    from: txData.from,
    to: txData.to,
    input: txData.input,
    blockNumber: parseInt(txData.blockNumber, 16),
    transactionIndex: parseInt(txData.transactionIndex, 16),
  };

  console.log("  from        :", tx.from);
  console.log("  to          :", tx.to);
  console.log("  blockNumber :", tx.blockNumber);

  // --- Check inputCallAddrs theo trace-tx-call-input.md ---
  console.log("\n[inputCallAddrs check]");
  const inputAddrs = extractAddressesFromInput(tx.input);
  console.log(`  Addresses extracted from input: ${inputAddrs.length}`);
  inputAddrs.forEach((a, i) => console.log(`    [${i}] ${a}`));

  // --- Full analysis ---
  console.log("\n[processTxData]");
  const result = await processTxData(tx);

  if (!result) {
    console.log("  => SKIP: khong thoa isTransferFromErc20 va isTransferSender");
    process.exit(0);
  }

  console.log("  isTransferSender   :", result.isTransferSender);
  console.log("  isTransferFromErc20    :", result.isTransferFromErc20);
  console.log("  isTransferFromExclSender:", result.isTransferFromErc20ExclSender);
  console.log("  isEcrecoverSender      :", result.isEcrecoverSender);
  console.log("  selector           :", result.selector ?? "");
  console.log("  symbol             :", result.symbol || "(none)");
  console.log("  inputCallAddrs     :", result.inputCallAddrs || "(none)");
  console.log("  getReservesParent  :", result.getReservesParentSelectors.join(",") || "(none)");
  console.log("  pairTokenSymbols   :", result.pairTokenSymbols.join(",") || "(none)");

  // parentSelector của các balanceOf call trên pair
  console.log("\n[swapPairWallets]");
  result.swapPairWallets.forEach((p) => console.log(`  ${p}`));

  if (result.swapPairWallets.length > 0) {
    const pairSet = new Set(result.swapPairWallets);
    const pairBalanceCalls = result.calls.filter(
      (c) => c.fn === "balanceOf(address)" && c.wallet && pairSet.has(c.wallet.toLowerCase()),
    );
    console.log("\n[pairToken parentSelectors]");
    const seen = new Set();
    pairBalanceCalls.forEach((c) => {
      const key = `${c.to}|${c.wallet}|${c.parentSelector}`;
      if (seen.has(key)) return;
      seen.add(key);
      console.log(`  token=${c.to}  wallet(pair)=${c.wallet}  parentSelector=${c.parentSelector ?? "(none)"}`);
    });
  }

  // Debug: scan trace tìm ecrecover precompile calls
  {
    const ECRECOVER = "0x0000000000000000000000000000000000000001";
    const found = [];
    function scanEcrecover(node) {
      if (!node) return;
      if (node.to?.toLowerCase() === ECRECOVER) found.push({ input: node.input, output: node.output });
      (node.calls || []).forEach(scanEcrecover);
    }
    const rawTrace = await (require("../core/trace").rpc)("debug_traceTransaction", [tx.hash, { tracer: "callTracer" }]);
    scanEcrecover(rawTrace);
    console.log("\n[ecrecover precompile calls]", found.length > 0 ? "" : "(none)");
    found.forEach((f, i) => console.log(`  [${i}] output=${f.output}`));
  }

  if (result.simulateResult) {
    console.log("  simulate.notRevert :", result.simulateResult.notRevert);
    console.log("  simulate.error     :", result.simulateResult.error ?? "(none)");
  }

  console.log("\n" + "=".repeat(60));

  if (result.isTransferFromErc20 && result.simulateResult?.notRevert) {
    const scanBase = chain === "ETH" ? "etherscan.io" : "bscscan.com";
    console.log("[Sheet4 row]");
    console.log(" ", [
      tx.hash,
      `https://${scanBase}/address/${tx.to?.toLowerCase()}`,
      `https://${scanBase}/tx/${tx.hash}`,
      result.symbol,
      "YES",
      result.selector ?? "",
      tx.blockNumber,
    ]);
  }

  if (result.isTransferSender) {
    console.log("[Sheet1 row]");
    console.log(" ", buildRow(tx, result, { chain }));
  }

  if (result.isTransferFromErc20ExclSender && result.isEcrecoverSender) {
    const scanBase = chain === "ETH" ? "etherscan.io" : "bscscan.com";
    console.log("[TransferFromSheet row]");
    console.log(" ", [
      tx.hash,
      `https://${scanBase}/address/${tx.to?.toLowerCase()}`,
      `https://${scanBase}/tx/${tx.hash}`,
      result.symbol,
      result.selector ?? "",
      tx.blockNumber,
      new Date().toLocaleString(),
    ]);
  }

  console.log("=".repeat(60));
  process.exit(0);
}

main().catch((err) => {
  console.error("Loi:", err.message);
  console.error(err.stack);
  process.exit(1);
});
