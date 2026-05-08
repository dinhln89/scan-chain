const { extractAddressesFromInput } = require("../core/trace");
const { createLogger } = require("../core/logger");

const log = createLogger("terminal", { console: true });
const input = process.argv[2];

if (!input) {
  log.error("Usage: node terminal/test-extract-addresses.js <inputHex>");
  process.exit(1);
}

const addresses = extractAddressesFromInput(input);

log.info(`Selector : ${input.slice(0, 10)}`);
log.info(`Addresses: ${addresses.length}`);
addresses.forEach((a, i) => log.info(`  [${i}] ${a}`));
