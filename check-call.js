const { Web3 } = require("web3");
const { createLogger } = require("./core/logger");

const log = createLogger(__filename, { console: true });

const BSC_RPC =
  process.env.BSC_RPC ||
  "https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2";

const web3 = new Web3(BSC_RPC);

const KNOWN_ERRORS = {
  "0x08c379a0": "Error(string)",
  "0x4e487b71": "Panic(uint256)",
  "0xf92ee8a9": "InvalidInitialization() — contract đã được initialize rồi",
  "0xd7e6bcf8": "NotInitializing()",
};

function decodeRevertReason(returnData) {
  if (!returnData || returnData === "0x") return "No return data";

  const selector = returnData.slice(0, 10).toLowerCase();

  if (KNOWN_ERRORS[selector]) {
    const label = KNOWN_ERRORS[selector];

    if (selector === "0x08c379a0") {
      try {
        const decoded = web3.eth.abi.decodeParameter(
          "string",
          "0x" + returnData.slice(10),
        );
        return `${label}: "${decoded}"`;
      } catch {
        return label;
      }
    }

    if (selector === "0x4e487b71") {
      const code = BigInt("0x" + returnData.slice(10)).toString();
      return `${label}: code=${code}`;
    }

    return label;
  }

  return `Unknown custom error, selector=${selector}, data=${returnData}`;
}

async function main() {
  const from = "0x2D2A87Bc0652072DAe6a4DCB45bc1CED4546b174";
  const to = "0x577b3ec481804afdc59740ed96c94c739f53bfe5";
  const inputData =
    "0xc4d66de80000000000000000000000002d2a87bc0652072dae6a4dcb45bc1ced4546b174";

  log.info(`From: ${from}`);
  log.info(`To  : ${to}`);
  log.info(`Data: ${inputData}`);

  try {
    const result = await web3.eth.call({ from, to, data: inputData });
    log.info(`Result (raw): ${result}`);
  } catch (err) {
    const returnData = err?.cause?.data;
    log.error(`eth_call reverted: ${decodeRevertReason(returnData)}`);
  }
}

main().catch((err) => log.error(err.message));
