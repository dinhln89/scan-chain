const Transaction = require("../models/Transaction");
const Contract = require("../models/Contract");
const IgnoreAddress = require("./ignore-address");
const IgnoreMethod = require("./ignore-method");
const { hasV3PathInInput, hasSignatureInInput } = require("./trace");

const CHAIN_CONFIGS = {
  bsc: {
    rpc: process.env.BSC_RPC || "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2",
    settingKey: "latest_block_bsc",
    explorerUrl: (addr) => `https://bscscan.com/address/${addr}`,
    label: "BSC",
  },
  eth: {
    rpc: process.env.ETH_RPC || "https://eth-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2",
    settingKey: "latest_block_eth",
    explorerUrl: (addr) => `https://etherscan.io/address/${addr}`,
    label: "ETH",
  },
};

let _blockedSet = new Set();
let _blockedSetLoadedAt = 0;
const BLOCKED_SET_TTL = 60_000;

async function getBlockedSet() {
  const now = Date.now();
  if (now - _blockedSetLoadedAt < BLOCKED_SET_TTL) return _blockedSet;
  const rows = await Contract.findAll({ where: { isBlock: true }, attributes: ["address"] });
  _blockedSet = new Set(rows.map((c) => c.address.toLowerCase()));
  _blockedSetLoadedAt = now;
  return _blockedSet;
}

function filterTxs(txs) {
  const ignoredSet = IgnoreAddress.getAll();
  const ignoredMethods = IgnoreMethod.getAll();
  return txs.filter((tx) => {
    if (!tx.input || tx.input === "0x") return false;
    if (tx.input.length > 5000) return false;
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const selector = tx.input.slice(0, 10).toLowerCase();
    return (
      !ignoredSet.has(from) &&
      !ignoredSet.has(to) &&
      !ignoredMethods.has(selector) &&
      !hasV3PathInInput(tx.input) &&
      !hasSignatureInInput(tx.input)
    );
  });
}

// Lưu danh sách tx vào DB. Trả về số tx đã insert mới.
// skipIfSelectorExists: bỏ qua nếu đã có tx cùng selector+to+type (dùng cho forward crawl)
async function saveTxs(chainKey, chain, blockNumber, txs, { skipIfSelectorExists = false } = {}) {
  let saved = 0;
  for (const tx of txs) {
    const selector = tx.input.slice(0, 10).toLowerCase();

    if (skipIfSelectorExists && tx.to) {
      const exists = await Transaction.findOne({
        where: { selector, to: tx.to.toLowerCase(), type: chainKey },
        attributes: ["id"],
      });
      if (exists) continue;
    }

    const [, created] = await Transaction.upsert({
      hash: tx.hash,
      blockNumber: Number(blockNumber),
      transactionIndex: tx.transactionIndex != null ? Number(tx.transactionIndex) : null,
      from: tx.from,
      to: tx.to || null,
      value: tx.value.toString(),
      gas: tx.gas != null ? Number(tx.gas) : null,
      input: tx.input,
      selector,
      type: chainKey,
    });

    if (created !== false) {
      saved++;
      if (tx.to) {
        const addr = tx.to.toLowerCase();
        const [contract] = await Contract.findOrCreate({
          where: { address: addr },
          defaults: { txCount: 0, url: chain.explorerUrl(addr) },
        });
        await contract.increment("txCount");
      }
    }
  }
  return saved;
}

function makeStats() {
  return { blocks: 0, filtered: 0, total: 0, fromBlock: null, toBlock: null, lastLog: Date.now() };
}

function flushStats(stats, label, log) {
  const now = Date.now();
  if (now - stats.lastLog >= 5000 && stats.blocks > 0) {
    log.info(`[${label}] Block ${stats.fromBlock}-${stats.toBlock} | ${stats.filtered}/${stats.total} tx saved`);
    stats.blocks = 0;
    stats.filtered = 0;
    stats.total = 0;
    stats.fromBlock = null;
    stats.toBlock = null;
    stats.lastLog = now;
  }
}

module.exports = { CHAIN_CONFIGS, getBlockedSet, filterTxs, saveTxs, makeStats, flushStats };
