const { Web3 } = require("web3");
const sequelize = require("../db");
const Setting = require("../models/Setting");
const Transaction = require("../models/Transaction");
const Contract = require("../models/Contract");
const IgnoreAddress = require("../core/ignore-address");
const IgnoreMethod = require("../core/ignore-method");
const { hasV3PathInInput, hasSignatureInInput } = require("../core/trace");
const { sendMessage } = require("../core/telegram");
const { createLogger } = require("../core/logger");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const log = createLogger(__filename);

let blockedSet = new Set();
let blockedSetLoadedAt = 0;
const BLOCKED_SET_TTL = 60_000;

async function getBlockedSet() {
  const now = Date.now();
  if (now - blockedSetLoadedAt < BLOCKED_SET_TTL) return blockedSet;
  const rows = await Contract.findAll({
    where: { isBlock: true },
    attributes: ["address"],
  });
  blockedSet = new Set(rows.map((c) => c.address.toLowerCase()));
  blockedSetLoadedAt = now;
  return blockedSet;
}

const BSC_RPC =
  process.env.BSC_RPC ||
  "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2";

const web3 = new Web3(BSC_RPC);

const stats = { blocks: 0, filtered: 0, total: 0, fromBlock: null, toBlock: null, lastLog: Date.now() };

function flushStats() {
  const now = Date.now();
  if (now - stats.lastLog >= 5000 && stats.blocks > 0) {
    log.info(`Block ${stats.fromBlock}-${stats.toBlock} | ${stats.filtered}/${stats.total} tx saved`);
    stats.blocks = 0;
    stats.filtered = 0;
    stats.total = 0;
    stats.fromBlock = null;
    stats.toBlock = null;
    stats.lastLog = now;
  }
}

// tra ve true neu co block moi duoc xu ly
async function processBlock() {
  let chainBlock;
  try {
    chainBlock = await web3.eth.getBlockNumber();
  } catch (err) {
    throw new Error(`[getBlockNumber] ${err.message}`);
  }

  const stored = await Setting.get("latest_block");
  if (!stored) {
    await Setting.set("latest_block", chainBlock.toString());
    log.info(`Chua co latest_block, luu block moi nhat: ${chainBlock}`);
    return false;
  }

  const savedBlock = BigInt(stored);

  if (savedBlock >= chainBlock) return false;

  const nextBlock = savedBlock + 1n;
  let block;
  try {
    block = await web3.eth.getBlock(nextBlock, true);
  } catch (err) {
    throw new Error(`[getBlock #${nextBlock}] ${err.message}`);
  }
  const txHashes = block.transactions;
  const withInput = txHashes.filter((tx) => tx.input && tx.input !== "0x");

  const ignoredSet = IgnoreAddress.getAll();
  const ignoredMethods = IgnoreMethod.getAll();

  const blockedSet = await getBlockedSet();

  const filtered = withInput.filter((tx) => {
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const selector = tx.input?.slice(0, 10)?.toLowerCase();

    return (
      !ignoredSet.has(from) &&
      !ignoredSet.has(to) &&
      !ignoredMethods.has(selector) &&
      !blockedSet.has(to) &&
      !hasV3PathInInput(tx.input) &&
      !hasSignatureInInput(tx.input)
    );
  });

  stats.blocks++;
  stats.total += txHashes.length;
  stats.filtered += filtered.length;
  if (stats.fromBlock === null) stats.fromBlock = nextBlock.toString();
  stats.toBlock = nextBlock.toString();
  flushStats();

  for (const tx of filtered) {
    if (tx.input.length > 5000) continue;

    const selector = tx.input?.slice(0, 10)?.toLowerCase() || null;
    if (selector && tx.to) {
      const exists = await Transaction.findOne({
        where: { selector, to: tx.to.toLowerCase() },
        attributes: ["id"],
      });
      if (exists) {
        continue;
      }
    }
    await Transaction.upsert({
      hash: tx.hash,
      blockNumber: Number(nextBlock),
      transactionIndex: tx.transactionIndex != null ? Number(tx.transactionIndex) : null,
      from: tx.from,
      to: tx.to || null,
      value: tx.value.toString(),
      input: tx.input,
      selector,
      type: "bsc",
    });
    if (tx.to) {
      const addr = tx.to.toLowerCase();
      const [contract] = await Contract.findOrCreate({
        where: { address: addr },
        defaults: { txCount: 0, url: `https://bscscan.com/address/${addr}` },
      });
      await contract.increment("txCount");
    }
  }

  await Setting.set("latest_block", nextBlock.toString());
  return true;
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();
  await IgnoreAddress.syncFromSheet();
  await IgnoreMethod.syncFromSheet();
  log.info("Bat dau lang nghe BSC...");

  const loop = async () => {
    let delay = 500;
    try {
      const hadBlock = await processBlock();
      // co block moi: check ngay sau 100ms de bat kip block tiep theo
      // khong co gi: BSC ~3s/block, doi 500ms de tranh spam getBlockNumber
      delay = hadBlock ? 100 : 500;
    } catch (err) {
      log.error(`Loi: ${err.message}`);
      if (err.stack) log.error(err.stack);
      delay = 2000;
    }
    setTimeout(loop, delay);
  };

  loop();
}

main().catch((err) => log.error(err.message));
