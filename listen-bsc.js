const { Web3 } = require("web3");
const sequelize = require("./db");
const Setting = require("./models/Setting");
const Transaction = require("./models/Transaction");
const IgnoreAddress = require("./core/ignore-address");
const IgnoreMethod = require("./core/ignore-method");
require("dotenv").config();

const BSC_RPC =
  process.env.BSC_RPC ||
  "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2";

const web3 = new Web3(BSC_RPC);

async function processBlock() {
  const chainBlock = await web3.eth.getBlockNumber();
  const stored = await Setting.get("latest_block");
  if (!stored) {
    await Setting.set("latest_block", chainBlock.toString());
    console.log(
      "Chua co latest_block, luu block moi nhat:",
      chainBlock.toString(),
    );
    return;
  }

  const savedBlock = BigInt(stored);

  if (savedBlock >= chainBlock) return;

  const nextBlock = savedBlock + 1n;
  const block = await web3.eth.getBlock(nextBlock, true);
  const txHashes = block.transactions;
  console.log(`Block ${nextBlock}: ${txHashes.length} tx`);

  const withInput = txHashes.filter((tx) => tx.input && tx.input !== "0x");

  const ignoredSet = IgnoreAddress.getAll();
  const ignoredMethods = IgnoreMethod.getAll();

  const filtered = withInput.filter((tx) => {
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const selector = tx.input?.slice(0, 10)?.toLowerCase();
    return !ignoredSet.has(from) && !ignoredSet.has(to) && !ignoredMethods.has(selector);
  });

  console.log(`  -> Co input data: ${withInput.length} tx, sau khi loc: ${filtered.length} tx`);

  for (const tx of filtered) {
    await Transaction.upsert({
      hash: tx.hash,
      blockNumber: Number(nextBlock),
      from: tx.from,
      to: tx.to || null,
      value: tx.value.toString(),
      input: tx.input,
      type: "bsc",
    });
    console.log("  Saved:", tx.hash);
  }

  await Setting.set("latest_block", nextBlock.toString());
  console.log("Cap nhat len:", nextBlock.toString());
}

async function main() {
  await sequelize.ensureDatabase();
  await sequelize.sync();
  console.log("Bat dau lang nghe BSC...");

  const loop = async () => {
    try {
      await processBlock();
    } catch (err) {
      console.error("Loi:", err.message);
    }
    setTimeout(loop, 100);
  };

  loop();
}

main().catch(console.error);
