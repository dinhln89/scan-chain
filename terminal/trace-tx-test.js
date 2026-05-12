require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const {
  analyzeTx,
  batchRpc,
  getErc20Symbol,
  rpc,
  simulateTx,
} = require("../core/trace");
const Contract = require("../models/Contract");
const sequelize = require("../db");

async function resolveSwapPairs(balanceOfWallets, getReservesAddrs) {
  if (balanceOfWallets.length === 0) return [];

  const fromTrace = balanceOfWallets.filter((a) => getReservesAddrs.has(a));

  const notFromTrace = balanceOfWallets.filter((a) => !getReservesAddrs.has(a));
  const rows = notFromTrace.length > 0
    ? await Contract.findAll({ where: { address: notFromTrace }, attributes: ["address", "isPair"] })
    : [];
  const dbMap = new Map(rows.map((c) => [c.address, c.isPair]));

  const known = notFromTrace.filter((a) => dbMap.get(a) === true);
  const unknown = notFromTrace.filter((a) => !dbMap.has(a));

  if (unknown.length > 0) {
    const results = await batchRpc(
      unknown.map((addr) => ({
        method: "eth_call",
        params: [{ to: addr, data: "0x0902f1ac" }, "latest"],
      })),
    );
    known.push(
      ...unknown.filter(
        (_, i) => !!(results[i] && results[i] !== "0x" && results[i].length >= 194),
      ),
    );
  }

  return [...fromTrace, ...known];
}

async function main() {
  const txHash = process.argv[2];
  if (!txHash) {
    console.error("Usage: node terminal/test-trace-tx.js <txHash>");
    process.exit(1);
  }

  await sequelize.ensureDatabase();
  await sequelize.sync({ alter: true });

  const txData = await rpc("eth_getTransactionByHash", [txHash]);
  if (!txData) {
    console.error("Khong tim thay tx:", txHash);
    process.exit(1);
  }

  const tx = {
    hash: txData.hash,
    from: txData.from,
    to: txData.to,
    input: txData.input,
    blockNumber: parseInt(txData.blockNumber, 16),
    transactionIndex: parseInt(txData.transactionIndex, 16),
  };

  console.log("\n[TX]");
  console.log("  hash        :", tx.hash);
  console.log("  from        :", tx.from);
  console.log("  to          :", tx.to);
  console.log("  blockNumber :", tx.blockNumber);

  const {
    calls,
    transfers,
    isCallInput,
    isTransferSender,
    isTransferFromErc20,
    selector,
    transactionIndex,
  } = await analyzeTx(tx.hash, { from: tx.from, to: tx.to, input: tx.input });

  console.log("\n[analyzeTx]");
  console.log("  selector           :", selector ?? "");
  console.log("  isTransferSender   :", isTransferSender);
  console.log("  isTransferFromErc20:", isTransferFromErc20);
  console.log("  isCallInput        :", isCallInput);

  if (!isTransferFromErc20 && !isTransferSender) {
    console.log("\n=> SKIP: khong thoa isTransferFromErc20 va isTransferSender");
    process.exit(0);
  }

  console.log("\n[ERC20 Transfers]");
  transfers.forEach((t, i) => {
    console.log(`  [${i}] token=${t.token}  from=${t.from}  to=${t.to}  amount=${t.amount}`);
  });

  const firstToSender = transfers.find(
    (t) => t.to.toLowerCase() === tx.from.toLowerCase(),
  );

  const getReservesAddrs = new Set(
    calls.filter((c) => c.fn === "getReserves()").map((c) => c.to?.toLowerCase()),
  );
  const balanceOfWallets = [
    ...new Set(
      calls
        .filter((c) => c.fn === "balanceOf(address)" && c.wallet)
        .map((c) => c.wallet.toLowerCase()),
    ),
  ];

  const [symbol, simulateResult, swapPairWallets] = await Promise.all([
    firstToSender ? getErc20Symbol(firstToSender.token).then((s) => s || "") : Promise.resolve(""),
    isTransferFromErc20
      ? simulateTx(tx.to, tx.input, tx.blockNumber, tx.transactionIndex ?? transactionIndex)
      : Promise.resolve(null),
    isTransferSender
      ? resolveSwapPairs(balanceOfWallets, getReservesAddrs)
      : Promise.resolve([]),
  ]);

  const now = new Date();

  console.log("\n[Result]");
  console.log("  symbol         :", symbol || "(none)");
  console.log("  swapPairWallets:", swapPairWallets);
  console.log("  getReservesAddrs:", [...getReservesAddrs]);
  if (simulateResult) {
    console.log("  simulate.notRevert:", simulateResult.notRevert);
    console.log("  simulate.error    :", simulateResult.error ?? "(none)");
  }

  console.log("\n" + "=".repeat(60));

  if (isTransferFromErc20 && simulateResult?.notRevert) {
    console.log("[Sheet4 row - isTransferFromErc20]");
    console.log(" ", [
      tx.hash,
      `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
      `https://bscscan.com/tx/${tx.hash}`,
      symbol,
      "YES",
      selector ?? "",
      tx.blockNumber,
      now.toLocaleString(),
    ]);
  } else if (isTransferFromErc20) {
    console.log("[Sheet4 - isTransferFromErc20 nhung simulate revert, khong ghi]");
  }

  if (isTransferSender) {
    console.log("[Sheet1 row - isTransferSender]");
    console.log(" ", [
      tx.hash,
      `https://bscscan.com/address/${tx.to?.toLowerCase()}`,
      `https://bscscan.com/tx/${tx.hash}`,
      symbol,
      isCallInput ? "YES" : "",
      getReservesAddrs.size > 0 ? "YES" : "",
      swapPairWallets.length > 0 ? "YES" : "",
      selector ?? "",
      tx.blockNumber,
      now.toLocaleString(),
    ]);
  }

  console.log("=".repeat(60));
  process.exit(0);
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
