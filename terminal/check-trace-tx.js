const { analyzeTx } = require("../core/trace");
const { createLogger } = require("../core/logger");

const log = createLogger("terminal", { console: true });

async function main() {
  const txHash = process.argv[2];
  if (!txHash) {
    log.error("Usage: node terminal/check-trace-tx.js <txHash>");
    process.exit(1);
  }

  const { addresses, calls, transfers, isCallInput, isTransferSender } = await analyzeTx(txHash);

  log.info("=".repeat(60));
  log.info(`TX              : ${txHash}`);
  log.info(`Link            : https://bscscan.com/tx/${txHash}`);
  log.info(`isCallInput     : ${isCallInput}`);
  log.info(`isTransferSender: ${isTransferSender}`);
  log.info("=".repeat(60));

  log.info("[Input Addresses]");
  if (addresses.length === 0) log.info("  (none)");
  addresses.forEach((a) => log.info(`  ${a}`));

  log.info("[Trace Calls]");
  if (calls.length === 0) {
    log.info("  Khong co getReserves / balanceOf");
  } else {
    calls.forEach((c, i) => {
      log.info(`  [${i}] ${c.fn} -> ${c.to}`);
      if (c.fn === "getReserves()" && c.decoded)
        log.info(`       reserve0=${c.decoded.reserve0}  reserve1=${c.decoded.reserve1}`);
      if (c.fn === "balanceOf(address)")
        log.info(`       wallet=${c.wallet}  balance=${c.decoded}`);
    });
  }

  log.info("[ERC20 Transfers]");
  if (transfers.length === 0) {
    log.info("  (none)");
  } else {
    transfers.forEach((t, i) => {
      log.info(`  [${i}] token=${t.token}`);
      log.info(`       from  =${t.from}`);
      log.info(`       to    =${t.to}`);
      log.info(`       amount=${t.amount}`);
    });
  }
}

main().catch((err) => {
  log.error(`Loi: ${err.message}`);
  process.exit(1);
});
