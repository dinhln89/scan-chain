const { Web3 } = require("web3");
const sequelize = require("../db");
const Setting = require("../models/Setting");
const IgnoreAddress = require("../core/ignore-address");
const IgnoreMethod = require("../core/ignore-method");
const { syncIgnoreSwap } = require("../core/trace");
const { CHAIN_CONFIGS, getBlockedSet, filterTxs, saveTxs, makeStats, flushStats } = require("../core/chain-block");
const History = require("../models/History");
const { createLogger } = require("../core/logger");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const log = createLogger(__filename);

async function processBlock(chainKey, chain, web3, stats) {
  let chainBlock;
  try {
    chainBlock = await web3.eth.getBlockNumber();
  } catch (err) {
    throw new Error(`[${chain.label}][getBlockNumber] ${err.message}`);
  }

  const stored = await Setting.get(chain.settingKey);
  if (!stored) {
    await Setting.set(chain.settingKey, chainBlock.toString());
    log.info(`[${chain.label}] Chua co ${chain.settingKey}, luu block moi nhat: ${chainBlock}`);
    return false;
  }

  const savedBlock = BigInt(stored);
  if (savedBlock >= chainBlock) return false;

  const nextBlock = savedBlock + 1n;
  log.info(`[${chain.label}] Block #${nextBlock}`);

  let block;
  try {
    block = await web3.eth.getBlock(nextBlock, true);
  } catch (err) {
    throw new Error(`[${chain.label}][getBlock #${nextBlock}] ${err.message}`);
  }

  const txs = block.transactions;
  const blocked = await getBlockedSet();
  const filtered = filterTxs(txs).filter((tx) => !blocked.has(tx.to?.toLowerCase()));
  const saved = await saveTxs(chainKey, chain, nextBlock, filtered, { skipIfSelectorExists: true });

  stats.blocks++;
  stats.total += txs.length;
  stats.filtered += saved;
  if (stats.fromBlock === null) stats.fromBlock = nextBlock.toString();
  stats.toBlock = nextBlock.toString();
  flushStats(stats, chain.label, log);

  await Promise.all([
    Setting.set(chain.settingKey, nextBlock.toString()),
    Setting.set(`chain_head_${chainKey}`, chainBlock.toString()),
  ]);
  return true;
}

function startChainLoop(chainKey, chain) {
  const web3 = new Web3(chain.rpc);
  const stats = makeStats();

  const loop = async () => {
    let delay = 500;
    try {
      const hadBlock = await processBlock(chainKey, chain, web3, stats);
      delay = hadBlock ? 500 : 2000;
    } catch (err) {
      log.error(`[${chain.label}] Loi: ${err.message}`);
      if (err.stack) log.error(err.stack);
      delay = 2000;
    }
    setTimeout(loop, delay);
  };

  log.info(`Bat dau lang nghe ${chain.label}...`);
  loop();
}

async function saveHistorySnapshot() {
  const today = new Date().toISOString().slice(0, 10);
  for (const [chainKey, chain] of Object.entries(CHAIN_CONFIGS)) {
    const [latestStr, oldStr, headStr] = await Promise.all([
      Setting.get(chain.settingKey),
      Setting.get(`old_block_${chainKey}`),
      Setting.get(`chain_head_${chainKey}`),
    ]);
    if (!latestStr || !oldStr || !headStr) continue;
    const scanned = parseInt(latestStr, 10) - parseInt(oldStr, 10);
    const chainHead = parseInt(headStr, 10);
    await History.upsert({ date: today, chain: chainKey, scanned, chainHead });
    log.info(`[${chain.label}] History ${today}: scanned=${scanned.toLocaleString()} chainHead=${chainHead.toLocaleString()}`);
  }
}

function scheduleDailySnapshot() {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 1, 0, 0);
  setTimeout(async () => {
    try {
      await saveHistorySnapshot();
    } catch (err) {
      log.error(`History snapshot error: ${err.message}`);
    }
    scheduleDailySnapshot();
  }, next - now);
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

  await saveHistorySnapshot();
  scheduleDailySnapshot();
}

main().catch((err) => log.error(err.message));
