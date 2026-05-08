const sequelize = require('./db');
require('./models/Transaction');

sequelize.ensureDatabase()
  .then(() => sequelize.sync({ alter: true }))
  .then(() => { console.log('Done'); process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
