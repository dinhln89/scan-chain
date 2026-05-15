// Usage: node run/listen-chain-old-block.js --chain=bsc --from=12345678 --to=12300000
// Crawl các block cũ từ --from xuống --to (inclusive)

const { Web3 } = require("web3");
const sequelize = require("../db");
const IgnoreAddress = require("../core/ignore-address");
const IgnoreMethod = require("../core/ignore-method");
const { syncIgnoreSwap } = require("../core/trace");
const { CHAIN_CONFIGS, filterTxs, saveTxs } = require("../core/chain-block");
const { createLogger } = require("../core/logger");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const log = createLogger(__filename, { console: true });

function getArg(name) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : null;
}

const chainKey = getArg("chain") || "bsc";
const fromBlock = getArg("from") ? BigInt(getArg("from")) : null;
const toBlock   = getArg("to")   ? BigInt(getArg("to"))   : null;

const chain = CHAIN_CONFIGS[chainKey];
if (!chain) {
  console.error(`Chain không hợp lệ: ${chainKey}. Dùng bsc hoặc eth.`);
  process.exit(1);
}
if (fromBlock === null || toBlock === null) {
  console.error("Thiếu tham số. Dùng: --chain=bsc --from=<block> --to=<block>");
  process.exit(1);
}
if (toBlock > fromBlock) {
  console.error(`--to (${toBlock}) phải nhỏ hơn hoặc bằng --from (${fromBlock})`);
  process.exit(1);
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();
  await IgnoreAddress.syncFromSheet();
  await IgnoreMethod.syncFromSheet();
  syncIgnoreSwap();

  const web3 = new Web3(chain.rpc);
  const total = Number(fromBlock - toBlock) + 1;
  log.info(`[${chain.label}] Crawl ${total} blocks: #${fromBlock} → #${toBlock}`);

  let done = 0;
  let totalSaved = 0;
  let lastLog = Date.now();

  for (let b = fromBlock; b >= toBlock; b--) {
    try {
      let block;
      try {
        block = await web3.eth.getBlock(b, true);
      } catch (err) {
        throw new Error(`[getBlock #${b}] ${err.message}`);
      }

      if (block) {
        const filtered = filterTxs(block.transactions);
        const saved = await saveTxs(chainKey, chain, b, filtered);
        totalSaved += saved;
      }
    } catch (err) {
      log.error(`Block #${b}: ${err.message}`);
    }

    done++;
    const now = Date.now();
    if (now - lastLog >= 5000) {
      const pct = ((done / total) * 100).toFixed(1);
      log.info(`[${chain.label}] ${done}/${total} blocks (${pct}%) | saved ${totalSaved} tx | block #${b}`);
      lastLog = now;
    }
  }

  log.info(`[${chain.label}] Hoan thanh. ${done} blocks, ${totalSaved} tx da luu.`);
  process.exit(0);
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
