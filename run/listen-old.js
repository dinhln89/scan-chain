const { Web3 } = require("web3");
const sequelize = require("../db");
const Setting = require("../models/Setting");
const IgnoreAddress = require("../core/ignore-address");
const IgnoreMethod = require("../core/ignore-method");
const { syncIgnoreSwap } = require("../core/trace");
const {
  CHAIN_CONFIGS,
  filterTxs,
  saveTxs,
  makeStats,
  flushStats,
} = require("../core/chain-block");
const { createLogger } = require("../core/logger");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const log = createLogger(__filename);

const OLD_BLOCK_KEY = (chainKey) => `old_block_${chainKey}`;
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 500; // nhường RPC cho listen-chain

async function fetchAndSave(chainKey, chain, web3, blockNumber) {
  let block;
  try {
    block = await web3.eth.getBlock(blockNumber, true);
  } catch (err) {
    throw new Error(`[getBlock #${blockNumber}] ${err.message}`);
  }
  if (!block) return { total: 0, saved: 0 };
  const filtered = filterTxs(block.transactions);
  const saved = await saveTxs(chainKey, chain, blockNumber, filtered);
  return { total: block.transactions.length, saved };
}

async function processBatch(chainKey, chain, web3, stats) {
  const settingKey = OLD_BLOCK_KEY(chainKey);

  let target;
  const stored = await Setting.get(settingKey);
  if (!stored) {
    const current = await web3.eth.getBlockNumber();
    await Setting.set(settingKey, current.toString());
    log.info(`[${chain.label}] Khoi tao old_block tai #${current}`);
    target = current;
  } else {
    target = BigInt(stored);
  }

  if (target <= 0n) {
    log.info(`[${chain.label}] Da scan toi block 0, dung lai.`);
    return false;
  }

  // Xử lý BATCH_SIZE blocks song song
  const blockNumbers = [];
  for (let i = 0n; i < BigInt(BATCH_SIZE) && target - i > 0n; i++) {
    blockNumbers.push(target - i);
  }

  const results = await Promise.allSettled(
    blockNumbers.map((b) => fetchAndSave(chainKey, chain, web3, b)),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      stats.blocks++;
      stats.total += r.value.total;
      stats.filtered += r.value.saved;
    } else {
      log.error(`[${chain.label}] ${r.reason?.message}`);
    }
  }

  const newTarget = target - BigInt(blockNumbers.length);
  if (stats.fromBlock === null) stats.fromBlock = target.toString();
  stats.toBlock = newTarget.toString();
  flushStats(stats, chain.label, log, "old");

  await Setting.set(settingKey, newTarget.toString());
  return true;
}

function startChainLoop(chainKey, chain) {
  const web3 = new Web3(chain.rpc);
  const stats = makeStats();

  const loop = async () => {
    let delay = BATCH_DELAY_MS;
    try {
      const hasMore = await processBatch(chainKey, chain, web3, stats);
      if (!hasMore) return;
    } catch (err) {
      log.error(`[${chain.label}] Loi: ${err.message}`);
      delay = 5000;
    }
    setTimeout(loop, delay);
  };

  log.info(
    `[${chain.label}] Bat dau crawl old blocks (batch=${BATCH_SIZE})...`,
  );
  loop();
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();
  await IgnoreAddress.syncFromSheet();
  await IgnoreMethod.syncFromSheet();
  syncIgnoreSwap();

  for (const [chainKey, chain] of Object.entries(CHAIN_CONFIGS)) {
    startChainLoop(chainKey, chain);
  }
}

main().catch((err) => log.error(err.message));
