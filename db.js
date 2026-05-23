const { Sequelize } = require('sequelize');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
}

// Đảm bảo index (selector, to, type) là UNIQUE — chỉ chạy 1 lần khi cần.
// Idempotent: nếu đã unique thì return ngay, không làm gì.
async function runMigrations() {
  const dbName = process.env.DB_NAME;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: dbName,
  });
  try {
    const [rows] = await conn.query(
      `SELECT NON_UNIQUE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'transactions'
         AND INDEX_NAME = 'transactions_selector_to_type'
       LIMIT 1`,
      [dbName],
    );
    // NON_UNIQUE = 0 nghĩa là đã unique → không cần làm gì
    if (rows.length > 0 && rows[0].NON_UNIQUE === 0) return;

    if (rows.length > 0) {
      // Xóa các row trùng (selector, to, type), giữ lại id nhỏ nhất
      await conn.query(
        `DELETE t1 FROM transactions t1
         INNER JOIN transactions t2
           ON t1.selector = t2.selector AND t1.\`to\` = t2.\`to\` AND t1.type = t2.type
          AND t1.id > t2.id
         WHERE t1.selector IS NOT NULL AND t1.\`to\` IS NOT NULL`,
      );
      await conn.query(`DROP INDEX transactions_selector_to_type ON transactions`);
    }

    await conn.query(
      `CREATE UNIQUE INDEX transactions_selector_to_type ON transactions (selector, \`to\`, type)`,
    );
  } finally {
    await conn.end();
  }
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
  }
);

sequelize.ensureDatabase = ensureDatabase;
sequelize.runMigrations = runMigrations;

module.exports = sequelize;
