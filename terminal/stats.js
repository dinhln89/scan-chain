const sequelize = require("../db");
const { readAll } = require("../core/stats-store");

function fmt(n) {
  return n.toLocaleString("en-US").padStart(15);
}

async function render() {
  const chains = await readAll();
  const now = new Date().toLocaleTimeString();
  process.stdout.write("\x1b[2J\x1b[H");
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│             Scan Chain Stats                 │");
  console.log("├──────────────┬───────────────┬───────────────┤");
  console.log("│              │      BSC      │      ETH      │");
  console.log("├──────────────┼───────────────┼───────────────┤");

  const [bsc, eth] = chains;
  const rows = [
    ["Scanned", bsc.scanned, eth.scanned],
    ["Remaining", bsc.remaining, eth.remaining],
    ["Chain head", bsc.chainHead, eth.chainHead],
  ];
  for (const [label, bscVal, ethVal] of rows) {
    const l = label.padEnd(12);
    const b = bscVal.toLocaleString("en-US").padStart(13);
    const e = ethVal.toLocaleString("en-US").padStart(13);
    console.log(`│ ${l} │ ${b} │ ${e} │`);
  }

  console.log("├──────────────┴───────────────┴───────────────┤");
  console.log(`│  Updated: ${now.padStart(34)}  │`);
  console.log("└──────────────────────────────────────────────┘");
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();

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
