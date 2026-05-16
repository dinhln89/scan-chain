const sequelize = require("../db");
const { read } = require("../core/stats-store");

async function render() {
  const { newBlocks, oldBlocks } = await read();
  const now = new Date().toLocaleTimeString();
  process.stdout.write("\x1b[2J\x1b[H");
  console.log("┌────────────────────────────────┐");
  console.log("│       Scan Chain Stats         │");
  console.log("├────────────────────────────────┤");
  console.log(`│  New blocks : ${String(newBlocks).padStart(15)}  │`);
  console.log(`│  Old blocks : ${String(oldBlocks).padStart(15)}  │`);
  console.log("├────────────────────────────────┤");
  console.log(`│  Updated    : ${now.padStart(15)}  │`);
  console.log("└────────────────────────────────┘");
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
