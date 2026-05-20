const { Op } = require("sequelize");
const sequelize = require("../db");
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

// In-memory cache cho skipIfSelectorExists — tránh query DB lặp lại mỗi block
// Key: "selector:to:type". Grows to ~N unique pairs rồi stable.
const _seenSelectorPairs = new Set();

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

function isDeadlock(err) {
  const errno = err?.original?.errno;
  return errno === 1213 || errno === 1205 || /deadlock|lock wait timeout/i.test(err?.message || "");
}

// Lưu danh sách tx vào DB. Trả về số tx đã insert mới.
// skipIfSelectorExists: bỏ qua nếu đã có tx cùng selector+to+type (dùng cho forward crawl)
async function saveTxs(chainKey, chain, blockNumber, txs, { skipIfSelectorExists = false } = {}) {
  if (txs.length === 0) return 0;

  const allData = txs.map((tx) => ({
    hash: tx.hash,
    blockNumber: Number(blockNumber),
    transactionIndex: tx.transactionIndex != null ? Number(tx.transactionIndex) : null,
    from: tx.from,
    to: tx.to || null,
    value: tx.value.toString(),
    gas: tx.gas != null ? Number(tx.gas) : null,
    input: tx.input,
    selector: tx.input.slice(0, 10).toLowerCase(),
    type: chainKey,
  }));

  // Forward crawl: loại selector+to+type đã tồn tại dùng in-memory cache
  // DB chỉ được query cho các pair chưa thấy bao giờ — sau vài block cache đủ và query gần như biến mất
  let candidates = allData;
  if (skipIfSelectorExists) {
    const checks = allData.filter((t) => t.to);
    if (checks.length > 0) {
      const unknown = checks.filter((t) => !_seenSelectorPairs.has(`${t.selector}:${t.to}:${chainKey}`));
      if (unknown.length > 0) {
        const tuples = unknown
          .map((t) => `(${sequelize.escape(t.selector)},${sequelize.escape(t.to)},${sequelize.escape(chainKey)})`)
          .join(",");
        const existing = await sequelize.query(
          `SELECT selector, \`to\`, type FROM transactions WHERE (selector, \`to\`, type) IN (${tuples}) GROUP BY selector, \`to\`, type`,
          { type: sequelize.QueryTypes.SELECT },
        );
        for (const e of existing) _seenSelectorPairs.add(`${e.selector}:${e.to}:${e.type}`);
      }
      candidates = allData.filter((t) => !t.to || !_seenSelectorPairs.has(`${t.selector}:${t.to}:${chainKey}`));
      // Thêm các tx mới insert vào cache để block tiếp không cần check DB
      for (const t of candidates.filter((t) => t.to)) _seenSelectorPairs.add(`${t.selector}:${t.to}:${chainKey}`);
    }
  }
  if (candidates.length === 0) return 0;

  // 1 batch query tìm hash đã tồn tại → chỉ insert mới
  const hashes = candidates.map((t) => t.hash);
  const existingHashes = new Set(
    (await Transaction.findAll({ where: { hash: { [Op.in]: hashes } }, attributes: ["hash"] })).map((r) => r.hash),
  );
  const newTxs = candidates.filter((t) => !existingHashes.has(t.hash));
  if (newTxs.length === 0) return 0;

  // 1 bulk insert — retry on deadlock (listen-chain vs listen-old concurrent writes)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await Transaction.bulkCreate(newTxs, { ignoreDuplicates: true });
      break;
    } catch (err) {
      if (isDeadlock(err) && attempt < 2) continue;
      throw err;
    }
  }

  // 1 raw upsert để tăng txCount theo batch
  const addrCounts = new Map();
  for (const tx of newTxs) {
    if (tx.to) {
      const addr = tx.to.toLowerCase();
      addrCounts.set(addr, (addrCounts.get(addr) || 0) + 1);
    }
  }
  if (addrCounts.size > 0) {
    const entries = [...addrCounts.entries()];
    const placeholders = entries.map(() => "(?, ?, ?)").join(", ");
    const params = entries.flatMap(([addr, count]) => [addr, count, chain.explorerUrl(addr)]);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await sequelize.query(
          `INSERT INTO \`contracts\` (address, txCount, url) VALUES ${placeholders} ON DUPLICATE KEY UPDATE txCount = txCount + VALUES(txCount)`,
          { replacements: params },
        );
        break;
      } catch (err) {
        if (isDeadlock(err) && attempt < 2) continue;
        throw err;
      }
    }
  }

  return newTxs.length;
}

// Pre-populate cache khi khởi động — chỉ lấy 200k block gần nhất để tránh full scan
async function warmSelectorCache() {
  const maxBlockRow = await sequelize.query(
    "SELECT MAX(blockNumber) AS maxBlock FROM transactions",
    { type: sequelize.QueryTypes.SELECT },
  );
  const maxBlock = maxBlockRow[0]?.maxBlock;
  if (!maxBlock) return;
  const fromBlock = Number(maxBlock) - 200_000;
  const rows = await sequelize.query(
    "SELECT DISTINCT selector, `to`, type FROM transactions WHERE blockNumber >= ? AND selector IS NOT NULL AND `to` IS NOT NULL",
    { replacements: [fromBlock], type: sequelize.QueryTypes.SELECT },
  );
  for (const r of rows) _seenSelectorPairs.add(`${r.selector}:${r.to}:${r.type}`);
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

module.exports = { CHAIN_CONFIGS, getBlockedSet, filterTxs, saveTxs, makeStats, flushStats, warmSelectorCache };
