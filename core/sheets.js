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

const https = require("https");
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchCsv(res.headers.location));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function parseCsv(csv) {
  return csv
    .split("\n")
    .map((line) =>
      line
        .trim()
        .split(",")
        .map((cell) => cell.replace(/^"|"$/g, "").trim()),
    )
    .filter((row) => row.some((cell) => cell));
}

async function getRows({ sheet } = {}) {
  if (!SPREADSHEET_ID) throw new Error("GOOGLE_SPREADSHEET_ID chua duoc cau hinh trong .env");
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  const csv = await fetchCsv(url);
  return parseCsv(csv);
}

module.exports = { append, deleteRows, getRows };
