require('dotenv').config();

const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

async function append(rows) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apps Script error: ${res.status} ${text}`);
  }
}

module.exports = { append };
