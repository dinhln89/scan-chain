const { Web3 } = require('web3');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const BSC_RPC = process.env.BSC_RPC || 'https://bsc-mainnet.nodereal.io/v1/23deb2fa6f2041158053ff943a2d1aa2';
const web3 = new Web3(BSC_RPC);

const PAIR_ABI = [
  {
    name: 'getReserves',
    type: 'function',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view',
  },
];

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
];

async function getReserves(pairAddress) {
  const pair = new web3.eth.Contract(PAIR_ABI, pairAddress);
  const { reserve0, reserve1 } = await pair.methods.getReserves().call();
  return { reserve0: reserve0.toString(), reserve1: reserve1.toString() };
}

async function balanceOf(tokenAddress, walletAddress) {
  const token = new web3.eth.Contract(ERC20_ABI, tokenAddress);
  const [balance, decimals, symbol] = await Promise.all([
    token.methods.balanceOf(walletAddress).call(),
    token.methods.decimals().call(),
    token.methods.symbol().call(),
  ]);
  const formatted = (Number(balance) / 10 ** Number(decimals)).toFixed(6);
  return { raw: balance.toString(), formatted, symbol };
}

async function main() {
  const pairAddress   = process.argv[2];
  const tokenAddress  = process.argv[3];
  const walletAddress = process.argv[4];

  if (!pairAddress || !tokenAddress || !walletAddress) {
    console.error('Usage: node get-reserves-balance.js <pairAddress> <tokenAddress> <walletAddress>');
    process.exit(1);
  }

  const [reserves, balance] = await Promise.all([
    getReserves(pairAddress),
    balanceOf(tokenAddress, walletAddress),
  ]);

  console.log('getReserves:');
  console.log('  reserve0:', reserves.reserve0);
  console.log('  reserve1:', reserves.reserve1);
  console.log('balanceOf:');
  console.log(`  ${balance.symbol}: ${balance.formatted} (raw: ${balance.raw})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
