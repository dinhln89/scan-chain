const { Op } = require("sequelize");
const Setting = require("../models/Setting");

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

module.exports = { readAll };
