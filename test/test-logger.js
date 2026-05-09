const { createLogger } = require("../core/logger");

const log = createLogger(__filename);

async function simulateError() {
  try {
    throw new Error("TEST_ERROR: day la loi thu nghiem tu trace-tx");
  } catch (err) {
    log.error(`Loi tx 0xTEST: ${err.message}`);
  }
}

simulateError().then(() => {
  console.log("Test xong. Kiem tra pm2 logs trace-tx");
  process.exit(0);
});
