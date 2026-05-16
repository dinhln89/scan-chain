const Setting = require("../models/Setting");

const KEY_NEW = "stats_new_blocks";
const KEY_OLD = "stats_old_blocks";

async function read() {
  const [n, o] = await Promise.all([Setting.get(KEY_NEW), Setting.get(KEY_OLD)]);
  return {
    newBlocks: parseInt(n || "0", 10),
    oldBlocks: parseInt(o || "0", 10),
  };
}

async function increment(type, n) {
  if (!n) return;
  const key = type === "new" ? KEY_NEW : KEY_OLD;
  const current = parseInt((await Setting.get(key)) || "0", 10);
  await Setting.set(key, String(current + n));
}

module.exports = { read, increment };
