require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const fs = require("fs");
const path = require("path");
const https = require("https");

const METHODS_FILE = path.resolve(__dirname, "../data/ignore-methods.json");
const ADDRESSES_FILE = path.resolve(__dirname, "../data/ignore-addresses.json");
const SPREADSHEET_ID = "1E6P0tLWMSiMIv7JNA3USpr-XAUeQp7OpzvFbJWesRQs";
const METHODS_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1198058145`;
const ADDRESSES_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1982385575`;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchUrl(res.headers.location));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function parseCSV(text) {
  return text.split("\n").reduce((acc, line) => {
    line = line.trim();
    const m = line.match(/^(0x[0-9a-fA-F]+),(.*)$/);
    if (!m) return acc;
    const sel = m[1].toLowerCase();
    let comment = m[2].trim();
    if (comment.startsWith('"') && comment.endsWith('"'))
      comment = comment.slice(1, -1);
    acc[sel] = comment;
    return acc;
  }, {});
}

async function syncMethods() {
  console.log("Fetching Sheet2 (ignore-methods)...");
  const csv = await fetchUrl(METHODS_URL);
  const remote = parseCSV(csv);
  console.log(`  Sheet2 co ${Object.keys(remote).length} selectors`);

  const data = JSON.parse(fs.readFileSync(METHODS_FILE, "utf8"));
  const added = [];

  for (const [sel, comment] of Object.entries(remote)) {
    if (!(sel in data)) {
      data[sel] = comment;
      added.push(sel);
    }
  }

  if (added.length > 0) {
    fs.writeFileSync(METHODS_FILE, JSON.stringify(data, null, 2));
    console.log(`  Da insert ${added.length} selectors moi:`);
    added.forEach((s) => console.log("   ", s, data[s] ? `(${data[s]})` : ""));
  } else {
    console.log("  Khong co selector moi.");
  }
}

async function syncAddresses() {
  console.log("Fetching Sheet3 (ignore-addresses)...");
  const csv = await fetchUrl(ADDRESSES_URL);
  const remote = csv
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter((l) => /^0x[0-9a-f]{40}$/.test(l));
  console.log(`  Sheet3 co ${remote.length} addresses`);

  const list = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
  const existing = new Set(list.map((a) => a.toLowerCase()));
  const added = [];

  for (const addr of remote) {
    if (!existing.has(addr)) {
      list.push(addr);
      added.push(addr);
    }
  }

  if (added.length > 0) {
    fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(list, null, 2));
    console.log(`  Da insert ${added.length} addresses moi:`);
    added.forEach((a) => console.log("   ", a));
  } else {
    console.log("  Khong co address moi.");
  }
}

async function main() {
  await syncMethods();
  console.log();
  await syncAddresses();
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
