#!/usr/bin/env node
// Clears a transaction of this wallet that is stuck pending, by sending a
// zero-value transfer to itself with the same nonce and a higher fee.
// Use when a CLI run stopped and later runs would queue behind the stuck one.
//
//   node clear-pending.js            # show what is pending, send nothing
//   node clear-pending.js --send     # replace the oldest pending transaction

require('dotenv').config();
const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'https://rpc.gnosischain.com';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error('Add PRIVATE_KEY to .env');

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const [mined, pending] = await Promise.all([
    provider.getTransactionCount(wallet.address, 'latest'),
    provider.getTransactionCount(wallet.address, 'pending'),
  ]);
  console.log(`Wallet ${wallet.address}`);
  console.log(`Next nonce: ${mined} mined, ${pending} including pending`);

  if (pending === mined) {
    console.log('Nothing is pending.');
    return;
  }
  console.log(`${pending - mined} transaction(s) pending, oldest at nonce ${mined}.`);
  if (!process.argv.includes('--send')) {
    console.log('Run with --send to replace the oldest one with a zero-value transfer to this wallet.');
    return;
  }

  // A replacement must raise both fees by at least 10%. 1 gwei is far above
  // anything this CLI sends on Gnosis and costs 0.000021 xDAI at most.
  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: 0n,
    nonce: mined,
    gasLimit: 21000n,
    maxFeePerGas: ethers.parseUnits('1', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
  });
  console.log(`Replacement sent: https://gnosisscan.io/tx/${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Mined in block ${receipt.blockNumber}. Nonce ${mined} is cleared.`);
})().catch((error) => {
  console.error(error.shortMessage || error.message);
  process.exit(1);
});
