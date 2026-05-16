const { Op } = require("sequelize");
const Setting = require("../models/Setting");
const History = require("../models/History");
const { CHAIN_CONFIGS } = require("./chain-block");

async function readAll() {
  const chains = ["bsc", "eth"];
  const keys = [
    ...chains.map((c) => `chain_head_${c}`),
    ...chains.map((c) => `latest_block_${c}`),
    ...chains.map((c) => `old_block_${c}`),
  ];
  const rows = await Setting.findAll({ where: { key: { [Op.in]: keys } } });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const get = (k) => parseInt(m.get(k) || "0", 10);

  return chains.map((c) => {
    const chainHead = get(`chain_head_${c}`);
    const latestBlock = get(`latest_block_${c}`);
    const oldBlock = get(`old_block_${c}`);
    const scanned = latestBlock - oldBlock;
    const remaining = chainHead - scanned;
    return { chain: c.toUpperCase(), scanned, remaining, chainHead, latestBlock, oldBlock };
  });
}

// Trả về mảng tối đa `days` ngày gần nhất (DESC), mỗi phần tử chứa delta scanned và % so với chainHead.
// delta = scanned hôm đó - scanned ngày hôm trước (cumulative snapshot).
async function readHistory(days = 7) {
  const chains = ["bsc", "eth"];
  // Lấy thêm 1 record để tính delta cho ngày cũ nhất
  const rows = await History.findAll({
    where: { chain: { [Op.in]: chains } },
    order: [["date", "ASC"]],
  });

  const byChain = {};
  for (const c of chains) byChain[c] = rows.filter((r) => r.chain === c);

  // Tập hợp các ngày duy nhất, lấy `days` ngày gần nhất (DESC)
  const allDates = [...new Set(rows.map((r) => r.date))].sort().reverse().slice(0, days);

  return allDates.map((date) => {
    const entry = { date };
    for (const c of chains) {
      const recs = byChain[c];
      const idx = recs.findIndex((r) => r.date === date);
      if (idx < 0) { entry[c] = { delta: null, pct: null }; continue; }
      const curr = recs[idx];
      const prev = idx > 0 ? recs[idx - 1] : null;
      const delta = prev ? Number(curr.scanned) - Number(prev.scanned) : Number(curr.scanned);
      const head = Number(curr.chainHead);
      const pct = delta != null && head > 0 ? ((delta / head) * 100).toFixed(2) : null;
      entry[c] = { delta, pct };
    }
    return entry;
  });
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
  }
}

module.exports = { readAll, readHistory, saveHistorySnapshot };
