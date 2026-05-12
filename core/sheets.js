require('dotenv').config();

const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

async function append(rows, { retries = 4, baseDelay = 1000, sheet } = {}) {
  let lastErr;
  const payload = JSON.stringify({ rows, ...(sheet ? { sheet } : {}) });
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      const json = await res.json();
      if (res.ok && !json.error) return;
      lastErr = new Error(`Apps Script error: ${json.error || res.status}`);
    } catch (err) {
      lastErr = err;
    }
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

async function getRows({ sheet } = {}) {
  const url = new URL(APPS_SCRIPT_URL);
  if (sheet) url.searchParams.set("sheet", sheet);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Apps Script error: ${res.status}`);
  return res.json();
}

module.exports = { append, deleteRows, getRows };
