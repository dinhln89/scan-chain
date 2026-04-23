const sequelize = require('../db');
const IgnoreAddress = require('../models/IgnoreAddress');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const address = process.argv[2];
  const note = process.argv[3] || '';

  if (!address) {
    console.error('Usage: node insert-ignore-address.js <address> [note]');
    process.exit(1);
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    console.error('Dia chi khong hop le:', address);
    process.exit(1);
  }

  await sequelize.sync();

  const [row, created] = await IgnoreAddress.findOrCreate({
    where: { address: address.toLowerCase() },
    defaults: { address: address.toLowerCase(), note },
  });

  if (created) {
    console.log('Da them:', row.address, note ? `(${note})` : '');
  } else {
    console.log('Da ton tai:', row.address);
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
