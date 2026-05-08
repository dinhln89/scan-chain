const IgnoreAddress = require('../core/ignore-address');
const { createLogger } = require('../core/logger');

const log = createLogger('terminal', { console: true });
const address = process.argv[2];

if (!address) {
  log.error('Usage: node terminal/insert-ignore-address.js <address>');
  process.exit(1);
}

if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
  log.error(`Dia chi khong hop le: ${address}`);
  process.exit(1);
}

const added = IgnoreAddress.add(address);
if (added) {
  log.info(`Da them: ${address.toLowerCase()}`);
} else {
  log.info(`Da ton tai: ${address.toLowerCase()}`);
}
