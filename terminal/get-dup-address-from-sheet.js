const https = require("https");

const SPREADSHEET_ID = "1E6P0tLWMSiMIv7JNA3USpr-XAUeQp7OpzvFbJWesRQs";
const GID = process.argv[2] || "0";

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID}`;

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

function parseCSVLine(line) {
  const fields = [];
  let cur = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      fields.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function extractAddress(value) {
  const m = value.match(/0x[0-9a-fA-F]{40}/);
  return m ? m[0].toLowerCase() : null;
}

function findDuplicates(addresses) {
  const count = {};
  for (const addr of addresses) {
    count[addr] = (count[addr] || 0) + 1;
  }
  return Object.entries(count)
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);
}

async function main() {
  console.log(`Fetching gid=${GID}...`);
  const csv = await fetchUrl(SHEET_URL);
  const lines = csv.split("\n").filter((l) => l.trim());

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/"/g, ""));
  const addrCol = headers.findIndex((h) => h === "address");
  if (addrCol === -1) {
    console.error("Khong tim thay column 'Address' trong sheet.");
    console.log("Headers hien tai:", headers.join(", "));
    process.exit(1);
  }

  const addresses = [];
  for (const line of lines.slice(1)) {
    const fields = parseCSVLine(line);
    const raw = fields[addrCol] || "";
    const addr = extractAddress(raw);
    if (addr) addresses.push(addr);
  }

  console.log(`Tong so dong co dia chi: ${addresses.length}`);

  const dups = findDuplicates(addresses);

  if (dups.length === 0) {
    console.log("Khong co dia chi trung lap.");
    return;
  }

  console.log(`\nTim thay ${dups.length} dia chi trung lap:\n`);
  for (const [addr, n] of dups) {
    console.log(`  ${addr}  (${n} lan)`);
  }
}

main().catch(console.error);
