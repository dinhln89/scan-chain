const IgnoreAddress = require('../core/ignore-address');

const address = process.argv[2];

if (!address) {
  console.error('Usage: node terminal/insert-ignore-address.js <address>');
  process.exit(1);
}

if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error('Dia chi khong hop le:', address);
  process.exit(1);
}

const added = IgnoreAddress.add(address);
if (added) {
  console.log('Da them:', address.toLowerCase());
} else {
  console.log('Da ton tai:', address.toLowerCase());
}
