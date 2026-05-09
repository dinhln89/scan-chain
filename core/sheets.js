require('dotenv').config();

const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

async function append(rows, { retries = 4, baseDelay = 1000, sheet } = {}) {
  let lastErr;
  const payload = JSON.stringify({ rows, ...(sheet ? { sheet } : {}) });
  console.log("[sheets] append payload:", payload.slice(0, 200));
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const text = await res.text();
    console.log("[sheets] append response:", res.status, text.slice(0, 200));
    if (res.ok) return;
    lastErr = new Error(`Apps Script error: ${res.status} ${text}`);
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, baseDelay * attempt));
    }
  }
  throw lastErr;
}

async function deleteRows(values, { sheet } = {}) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "deleteRows", values, ...(sheet ? { sheet } : {}) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apps Script error: ${res.status} ${text}`);
  }
}

module.exports = { append, deleteRows };
