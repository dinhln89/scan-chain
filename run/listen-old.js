const { Web3 } = require("web3");
const sequelize = require("../db");
const Setting = require("../models/Setting");
const IgnoreAddress = require("../core/ignore-address");
const IgnoreMethod = require("../core/ignore-method");
const { syncIgnoreSwap } = require("../core/trace");
const { CHAIN_CONFIGS, filterTxs, saveTxs, makeStats, flushStats } = require("../core/chain-block");
const { createLogger } = require("../core/logger");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const log = createLogger(__filename);

// Setting key riêng để không xung đột với listen-chain
const OLD_BLOCK_KEY = (chainKey) => `old_block_${chainKey}`;

async function processBlock(chainKey, chain, web3, stats) {
  const settingKey = OLD_BLOCK_KEY(chainKey);

  let target;
  const stored = await Setting.get(settingKey);
  if (!stored) {
    // Lần đầu: lấy block hiện tại và lưu làm điểm xuất phát
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

  log.info(`[${chain.label}] Old block #${target}`);

  let block;
  try {
    block = await web3.eth.getBlock(target, true);
  } catch (err) {
    throw new Error(`[${chain.label}][getBlock #${target}] ${err.message}`);
  }

  if (block) {
    const filtered = filterTxs(block.transactions);
    const saved = await saveTxs(chainKey, chain, target, filtered);

    stats.blocks++;
    stats.total += block.transactions.length;
    stats.filtered += saved;
    if (stats.fromBlock === null) stats.fromBlock = target.toString();
    stats.toBlock = target.toString();
    flushStats(stats, chain.label, log);
  }

  // Lần sau scan block trước đó
  await Setting.set(settingKey, (target - 1n).toString());
  return true;
}

function startChainLoop(chainKey, chain) {
  const web3 = new Web3(chain.rpc);
  const stats = makeStats();

  const loop = async () => {
    let delay = 200;
    try {
      const hadBlock = await processBlock(chainKey, chain, web3, stats);
      if (!hadBlock) return; // dừng khi đã scan hết
    } catch (err) {
      log.error(`[${chain.label}] Loi: ${err.message}`);
      if (err.stack) log.error(err.stack);
      delay = 2000;
    }
    setTimeout(loop, delay);
  };

  log.info(`[${chain.label}] Bat dau crawl old blocks...`);
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
