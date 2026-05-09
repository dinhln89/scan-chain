require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const https = require("https");
const { Op } = require("sequelize");
const sequelize = require("../db");
const Transaction = require("../models/Transaction");
const { hasSignatureInInput } = require("../core/trace");

const SPREADSHEET_ID = "1E6P0tLWMSiMIv7JNA3USpr-XAUeQp7OpzvFbJWesRQs";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=0`;

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

function parseTxHashesFromCsv(csv) {
  const lines = csv.split("\n").filter((l) => l.trim());
  const hashes = [];
  for (const line of lines.slice(1)) {
    const col0 = line.split(",")[0].replace(/"/g, "").trim();
    const m = col0.match(/0x[0-9a-fA-F]{64}/);
    if (m) hashes.push(m[0].toLowerCase());
  }
  return [...new Set(hashes)];
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();

  console.log("Fetching Sheet1...");
  const csv = await fetchUrl(SHEET_URL);
  const hashes = parseTxHashesFromCsv(csv);
  console.log(`Tim thay ${hashes.length} tx hash trong sheet.`);

  const txs = await Transaction.findAll({
    where: { hash: { [Op.in]: hashes } },
    attributes: ["hash", "input"],
  });

  console.log(`Query DB duoc ${txs.length} tx.`);

  const withSignature = txs
    .filter((tx) => hasSignatureInInput(tx.input))
    .map((tx) => tx.hash);

  console.log(`\nTx co chu ky trong input: ${withSignature.length}`);
  console.log(withSignature);

  process.exit(0);
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
