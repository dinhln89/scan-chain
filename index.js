const pool = require('./db');

async function main() {
  const [rows] = await pool.query('SELECT 1 + 1 AS result');
  console.log('Ket noi thanh cong! Ket qua:', rows[0].result);
  await pool.end();
}

main().catch(console.error);
