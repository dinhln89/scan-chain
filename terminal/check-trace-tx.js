const { analyzeTx } = require("../core/trace");

async function main() {
  const txHash = process.argv[2];
  if (!txHash) {
    console.error("Usage: node terminal/check-trace-tx.js <txHash>");
    process.exit(1);
  }

  const { addresses, calls, transfers } = await analyzeTx(txHash);

  console.log("=".repeat(60));
  console.log("TX   :", txHash);
  console.log("Link :", `https://bscscan.com/tx/${txHash}`);
  console.log("=".repeat(60));

  console.log("\n[Input Addresses]");
  if (addresses.length === 0) console.log("  (none)");
  addresses.forEach((a) => console.log(" ", a));

  console.log("\n[Trace Calls]");
  if (calls.length === 0) {
    console.log("  Khong co getReserves / balanceOf");
  } else {
    calls.forEach((c, i) => {
      console.log(`  [${i}] ${c.fn} -> ${c.to}`);
      if (c.fn === "getReserves()" && c.decoded)
        console.log(
          `       reserve0=${c.decoded.reserve0}  reserve1=${c.decoded.reserve1}`,
        );
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
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
