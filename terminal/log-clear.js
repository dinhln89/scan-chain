const fs = require("fs");
const path = require("path");

const LOG_DIR = path.resolve(__dirname, "../logs");

function confirm(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (data) => {
      process.stdin.destroy();
      resolve(data.trim().toLowerCase() === "y");
    });
  });
}

async function main() {
  const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".log"));

  if (files.length === 0) {
    console.log("Khong co file log nao.");
    return;
  }

  console.log("Se xoa:");
  files.forEach((f) => console.log(`  ${f}`));

  const ok = await confirm("Xac nhan xoa? (y/N): ");
  if (!ok) {
    console.log("Huy.");
    return;
  }

  for (const file of files) {
    fs.writeFileSync(path.join(LOG_DIR, file), "");
    console.log(`Xoa ${file} xong`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
