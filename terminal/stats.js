const sequelize = require("../db");
const {
  readAll,
  readHistory,
  saveHistorySnapshot,
} = require("../core/stats-store");

function n(val, w = 13) {
  if (val == null) return "N/A".padStart(w);
  return val.toLocaleString("en-US").padStart(w);
}

function pct(val, w = 7) {
  if (val == null) return "N/A".padStart(w);
  return `${val}%`.padStart(w);
}

async function render() {
  const [chains, history] = await Promise.all([readAll(), readHistory(7)]);
  const [bsc, eth] = chains;

  process.stdout.write("\x1b[2J\x1b[H");

  // --- Current stats ---
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│             Scan Chain Stats                 │");
  console.log("├──────────────┬───────────────┬───────────────┤");
  console.log("│              │      BSC      │      ETH      │");
  console.log("├──────────────┼───────────────┼───────────────┤");
  for (const [label, bVal, eVal] of [
    ["Scanned", bsc.scanned, eth.scanned],
    ["Remaining", bsc.remaining, eth.remaining],
    ["Chain head", bsc.chainHead, eth.chainHead],
  ]) {
    console.log(`│ ${label.padEnd(12)} │ ${n(bVal)} │ ${n(eVal)} │`);
  }
  console.log("├──────────────┴───────────────┴───────────────┤");
  console.log(`│  Updated: ${new Date().toLocaleTimeString().padStart(34)} │`);
  console.log("└──────────────────────────────────────────────┘");

  if (history.length === 0) return;

  // --- 7-day history ---
  console.log("");
  console.log("┌────────────┬───────────────┬───────┬───────────────┬───────┐");
  console.log("│    Date    │  BSC Scanned  │ BSC%  │  ETH Scanned  │ ETH%  │");
  console.log("├────────────┼───────────────┼───────┼───────────────┼───────┤");
  for (const row of history) {
    const b = row.bsc ?? { delta: null, pct: null };
    const e = row.eth ?? { delta: null, pct: null };
    console.log(
      `│ ${row.date} │ ${n(b.delta)} │ ${pct(b.pct)} │ ${n(e.delta)} │ ${pct(e.pct)} │`,
    );
  }
  console.log("└────────────┴───────────────┴───────┴───────────────┴───────┘");
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();
  await saveHistorySnapshot().catch(() => {});

  const loop = async () => {
    try {
      await render();
    } catch {
      // ignore display errors
    }
    setTimeout(loop, 1000);
  };

  loop();
}

main().catch(console.error);
