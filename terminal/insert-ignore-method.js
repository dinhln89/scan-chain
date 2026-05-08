const IgnoreMethod = require('../core/ignore-method');
const { createLogger } = require('../core/logger');

const log = createLogger('terminal', { console: true });
const selector = process.argv[2];

if (!selector) {
  log.error('Usage: node terminal/insert-ignore-method.js <selector>');
  log.error('Example: node terminal/insert-ignore-method.js 0xa9059cbb');
  process.exit(1);
}

try {
  const added = IgnoreMethod.add(selector);
  if (added) {
    log.info(`Da them: ${selector.toLowerCase()}`);
  } else {
    log.info(`Da ton tai: ${selector.toLowerCase()}`);
  }
} catch (err) {
  log.error(`Loi: ${err.message}`);
  process.exit(1);
}
