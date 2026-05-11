const fs = require("fs");
const path = require("path");

const LOG_DIR = path.resolve(__dirname, "../logs");

function formatSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".log"));

let total = 0;
for (const file of files) {
  const stat = fs.statSync(path.join(LOG_DIR, file));
  total += stat.size;
  console.log(`${file.padEnd(30)} ${formatSize(stat.size).padStart(10)}`);
}

console.log("-".repeat(42));
console.log(`${"Total".padEnd(30)} ${formatSize(total).padStart(10)}`);
