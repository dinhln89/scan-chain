require('dotenv').config();

const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

async function append(rows, { retries = 4, baseDelay = 1000, sheet } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, ...(sheet ? { sheet } : {}) }),
    });
    if (res.ok) return;
    const text = await res.text();
    lastErr = new Error(`Apps Script error: ${res.status} ${text}`);
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, baseDelay * attempt));
    }
  }
  throw lastErr;
}

module.exports = { append };
