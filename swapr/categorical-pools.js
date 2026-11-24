#!/usr/bin/env node
// Creates and funds the Swapr (Algebra) pools of a categorical proposal
// (FutarchyCategoricalFactory) on Gnosis. setupFutarchyPoolsAuto in
// algebra-cli.js only builds the YES/NO pools, so categorical proposals use
// this script. Per answer it makes the two pools the market page reads
// (src/utils/proposalOutcomes.js fetchOutcomePools):
//   - conditional: ANSWER_<company> / ANSWER_<currency>, at --spot
//   - prediction:  ANSWER_<currency> / <currency>, at --probability
// INVALID gets no pools: its tokens stay in the wallet, for merging or for
// redeeming if the question resolves Invalid. Neither does an answer another
// proposal follows up (a chained "Other"): the market shows that proposal's
// answers instead.
// A proposal that follows up an answer of another one (parentMarket, such as
// its "Other") splits that answer's tokens instead of the collaterals: the
// --split-* options split the parent answer's tokens, which must be in the
// wallet. Its prediction pools quote in the currency collateral too, as in
// Seer's opportunity markets, so their price is the answer's whole chance:
// --probability defaults to the parent answer's chance divided by the answers.
//
// Usage:
//   node categorical-pools.js <proposal> --spot <currency per company> [options]
//     --split-company <n>   split n of the company collateral first
//     --split-currency <n>  split n of the currency collateral first
//     --prediction <n>      answer currency tokens per prediction pool (default 1)
//     --probability <p>     starting chance of every answer (default 1/answers, times
//                           the parent answer's chance for a follow-up proposal)
//     --send                send the transactions; without it the script only prints the plan
// Each conditional pool gets all the answer's company tokens the wallet holds,
// with spot times that many of the answer's currency tokens. Existing pools
// with liquidity are skipped, so a run that stopped halfway can be repeated.
// Reads PRIVATE_KEY and RPC_URL from .env, like algebra-cli.js.
require('dotenv').config();
const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'https://rpc.gnosischain.com';
const CATEGORICAL_ROUTER = process.env.CATEGORICAL_ROUTER_ADDRESS || '0x97Fa06A3067bC5faB00D28A30aC7E8555742a023';
const CONDITIONAL_TOKENS = '0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce';
const POSITION_MGR = '0x91fd594c46d8b01e62dbdebed2401dde01817834';
const ALGEBRA_FACTORY = '0xA0864cCA6E114013AB0e27cbd5B6f4c8947da766';
const CATEGORICAL_FACTORY = process.env.CATEGORICAL_FACTORY_ADDRESS || '0x4e79be3a63b09d22D4DAfcd66Feb00535A654295';
const MAX_TICK = 887272;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const proposalAddress = args[0];
const spot = Number(option('spot'));
if (!ethers.isAddress(proposalAddress) || !(spot > 0)) {
  console.error('Usage: node categorical-pools.js <proposal> --spot <currency per company> [--split-company n] [--split-currency n] [--prediction n] [--probability p] [--send]');
  process.exit(1);
}
if (!process.env.PRIVATE_KEY) throw new Error('Add PRIVATE_KEY to .env');

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const SEND = flag('send');

const erc20 = (address) => new ethers.Contract(address, [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function symbol() view returns (string)',
], wallet);
const proposal = new ethers.Contract(proposalAddress, [
  'function numOutcomes() view returns (uint256)',
  'function outcomes(uint256) view returns (string)',
  'function wrappedOutcome(uint256) view returns (address, bytes)',
  'function collateralToken1() view returns (address)',
  'function collateralToken2() view returns (address)',
  'function conditionId() view returns (bytes32)',
  'function parentMarket() view returns (address)',
  'function parentOutcome() view returns (uint256)',
], provider);
const router = new ethers.Contract(CATEGORICAL_ROUTER, ['function splitPosition(address,address,uint256)'], wallet);
const positionManager = new ethers.Contract(POSITION_MGR, [
  'function createAndInitializePoolIfNecessary(address,address,uint160) returns (address)',
  'function mint((address token0,address token1,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256,uint128,uint256,uint256)',
], wallet);
const factory = new ethers.Contract(ALGEBRA_FACTORY, ['function poolByPair(address,address) view returns (address)'], provider);
const pool = (address) => new ethers.Contract(address, [
  'function liquidity() view returns (uint128)',
  'function tickSpacing() view returns (int24)',
  'function token0() view returns (address)',
  'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint16 communityFeeToken0, uint16 communityFeeToken1, bool unlocked)',
], provider);
const categoricalFactory = new ethers.Contract(CATEGORICAL_FACTORY, [
  'function marketsCount() view returns (uint256)',
  'function proposals(uint256) view returns (address)',
], provider);

const fmt = (wei) => ethers.formatEther(wei);
const parse = (value) => ethers.parseEther(String(value));
// Decimal amount times a ratio, in wei, without going through a float of the wei amount.
const times = (wei, ratio) => (wei * parse(ratio.toFixed(18))) / 10n ** 18n;
const deadline = () => Math.floor(Date.now() / 1000) + 1200;
const sqrt = (value) => {
  if (value < 2n) return value;
  let x = value, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + value / x) / 2n; }
  return x;
};
// sqrtPriceX96 of a pool that holds amount0 of token0 and amount1 of token1.
const sqrtPriceX96 = (amount0, amount1) => sqrt((amount1 << 192n) / amount0);

// Price of `base` in `quote` in their pool, null when there is no such pool.
async function poolPrice(base, quote) {
  const address = await factory.poolByPair(base, quote);
  if (address === ethers.ZeroAddress || await pool(address).liquidity() === 0n) return null;
  const [state, token0] = await Promise.all([pool(address).globalState(), pool(address).token0()]);
  const ratio = Number(state.price) / 2 ** 96;
  return token0.toLowerCase() === base.toLowerCase() ? ratio * ratio : 1 / (ratio * ratio);
}

// The chance the market gives answer `index` of `market`: its prediction
// price, or what the other answers leave of the market's whole chance when it
// has no pool. A follow-up market's answers share the chance of the answer it
// follows up (1 for a root). null when it cannot be told.
async function answerChance(market, index) {
  const n = Number(await market.numOutcomes());
  const currency = await market.collateralToken2();
  const prices = await Promise.all(Array.from({ length: n }, async (_, i) => poolPrice((await market.wrappedOutcome(n + i))[0], currency)));
  if (prices[index] !== null) return prices[index];
  const others = prices.filter((_, i) => i !== index);
  if (others.includes(null)) return null;
  const parent = await market.parentMarket();
  const total = parent === ethers.ZeroAddress ? 1 : await answerChance(market.attach(parent), Number(await market.parentOutcome()));
  return total === null ? null : total - others.reduce((a, b) => a + b, 0);
}

// The answers of `address` another proposal of the factory follows up.
async function followedUpAnswers(address) {
  const count = Number(await categoricalFactory.marketsCount());
  const children = await Promise.all(Array.from({ length: count }, async (_, i) => {
    const child = proposal.attach(await categoricalFactory.proposals(i));
    return (await child.parentMarket()).toLowerCase() === address.toLowerCase() ? Number(await child.parentOutcome()) : null;
  }));
  return new Set(children.filter((index) => index !== null));
}

// Fees: GAS_PRICE_GWEI from .env when set, as in algebra-cli.js. Otherwise a
// 1 gwei tip: the tip ethers v6 asks the node for can be close to zero, and
// rpc.gnosischain.com refuses such transactions ("txpool is full").
const MIN_TIP = ethers.parseUnits('1', 'gwei');
async function feeOptions() {
  if (process.env.GAS_PRICE_GWEI && process.env.GAS_PRICE_GWEI !== 'auto') {
    return { gasPrice: ethers.parseUnits(process.env.GAS_PRICE_GWEI, 'gwei') };
  }
  const block = await provider.getBlock('latest');
  return { maxPriorityFeePerGas: MIN_TIP, maxFeePerGas: block.baseFeePerGas * 2n + MIN_TIP };
}

// Gas limit at twice the estimate: Algebra swaps and mints have run out of gas
// on-chain at the estimate.
async function send(label, contract, method, params, overrides = {}) {
  const estimate = await contract[method].estimateGas(...params, overrides);
  const tx = await contract[method](...params, { ...overrides, ...(await feeOptions()), gasLimit: estimate * 2n });
  const receipt = await tx.wait();
  console.log(`  ${label}: ${tx.hash} status ${receipt.status}`);
  if (receipt.status !== 1) throw new Error(`${label} failed`);
}

// Exact approvals, as the rest of the CLI does by default.
async function approve(token, spender, amount) {
  const contract = erc20(token);
  if (await contract.allowance(wallet.address, spender) >= amount) return;
  await send(`approve ${await contract.symbol()}`, contract, 'approve', [spender, amount]);
}

async function main() {
  const n = Number(await proposal.numOutcomes());
  const ctf = new ethers.Contract(CONDITIONAL_TOKENS, ['function getOutcomeSlotCount(bytes32) view returns (uint256)'], provider);
  const slots = Number(await ctf.getOutcomeSlotCount(await proposal.conditionId()));
  if (slots !== n + 1) throw new Error(`${proposalAddress} is not a categorical proposal (${slots} slots for ${n} outcomes)`);

  // What the proposal splits: the collaterals, or the parent answer's tokens.
  const collateral1 = await proposal.collateralToken1();
  const collateral2 = await proposal.collateralToken2();
  let company = collateral1;
  let currency = collateral2;
  let parentChance = 1;
  const parentAddress = await proposal.parentMarket();
  if (parentAddress !== ethers.ZeroAddress) {
    const parent = proposal.attach(parentAddress);
    const parentAnswers = Number(await parent.numOutcomes());
    const index = Number(await proposal.parentOutcome());
    [company] = await parent.wrappedOutcome(index);
    [currency] = await parent.wrappedOutcome(parentAnswers + index);
    parentChance = await answerChance(parent, index);
    console.log(`follows up answer ${index} (${await parent.outcomes(index)}) of ${parentAddress}, chance ${parentChance ?? 'unknown'}`);
  }
  const [companySymbol, currencySymbol, collateralSymbol] = await Promise.all([erc20(company).symbol(), erc20(currency).symbol(), erc20(collateral2).symbol()]);
  const prediction = parse(option('prediction', '1'));
  const probability = Number(option('probability', parentChance === null ? NaN : parentChance / n));
  // Also catches a parent answer its siblings leave nothing to (their prices add up to 1 or more).
  if (!(probability > 0 && probability < 1)) throw new Error(`starting chance ${probability} is not between 0 and 1; pass --probability`);
  const followedUp = await followedUpAnswers(proposalAddress);
  const splitCompany = parse(option('split-company', '0'));
  const splitCurrency = parse(option('split-currency', '0'));

  const answers = [];
  for (let i = 0; i < n; i++) {
    const [companyToken] = await proposal.wrappedOutcome(i);
    const [currencyToken] = await proposal.wrappedOutcome(n + i);
    if (followedUp.has(i)) console.log(`  ${await proposal.outcomes(i)}: followed up by another proposal, no pools`);
    else answers.push({ label: await proposal.outcomes(i), company: companyToken, currency: currencyToken });
  }

  console.log(`${n} answers, ${companySymbol}/${currencySymbol}, spot ${spot} ${currencySymbol} per ${companySymbol}, prediction ${fmt(prediction)} at ${probability}`);
  console.log(`wallet ${wallet.address}: ${fmt(await erc20(company).balanceOf(wallet.address))} ${companySymbol}, ${fmt(await erc20(currency).balanceOf(wallet.address))} ${currencySymbol}`);

  // Every pool's tokens, checked before anything is sent. Splits add to every answer.
  const plan = [];
  for (const answer of answers) {
    const companyHeld = await erc20(answer.company).balanceOf(wallet.address) + splitCompany;
    const currencyHeld = await erc20(answer.currency).balanceOf(wallet.address) + splitCurrency;
    const conditional = { label: `${answer.label} conditional`, tokenA: answer.company, amountA: companyHeld, tokenB: answer.currency, amountB: times(companyHeld, spot) };
    const predictionPool = { label: `${answer.label} prediction`, tokenA: answer.currency, amountA: prediction, tokenB: collateral2, amountB: times(prediction, probability) };
    let currencyNeeded = 0n;
    for (const p of [conditional, predictionPool]) {
      const address = await factory.poolByPair(p.tokenA, p.tokenB);
      p.skip = address !== ethers.ZeroAddress && await pool(address).liquidity() > 0n;
      console.log(`  ${p.label}: ${p.skip ? `${address} has liquidity, skipped` : `${fmt(p.amountA)} / ${fmt(p.amountB)}`}`);
      if (!p.skip && p === conditional && companyHeld === 0n) throw new Error(`no ${answer.label} company tokens for its conditional pool; split some with --split-company`);
      if (!p.skip && (p.amountA === 0n || p.amountB === 0n)) throw new Error(`${p.label} would start with an empty side; raise --prediction or the amounts`);
      if (!p.skip) currencyNeeded += p === conditional ? p.amountB : p.amountA;
      if (!p.skip) plan.push(p);
    }
    if (currencyNeeded > currencyHeld) throw new Error(`${answer.label} needs ${fmt(currencyNeeded)} of its currency token and will hold ${fmt(currencyHeld)}; split more with --split-currency`);
  }
  // Prediction pools take the currency collateral, which the root's splits take too.
  const currencyForPredictions = plan.filter((p) => p.tokenB === collateral2).reduce((sum, p) => sum + p.amountB, 0n);
  const collateralNeeded = currencyForPredictions + (currency === collateral2 ? splitCurrency : 0n);
  if (collateralNeeded > await erc20(collateral2).balanceOf(wallet.address)) throw new Error(`not enough ${collateralSymbol}`);
  if (currency !== collateral2 && splitCurrency > await erc20(currency).balanceOf(wallet.address)) throw new Error(`not enough ${currencySymbol}`);
  if (splitCompany > await erc20(company).balanceOf(wallet.address)) throw new Error(`not enough ${companySymbol}`);
  if (!SEND) { console.log('Plan only; add --send to send it.'); return; }

  if (splitCompany > 0n) {
    await approve(company, CATEGORICAL_ROUTER, splitCompany);
    await send(`split ${fmt(splitCompany)} ${companySymbol}`, router, 'splitPosition', [proposalAddress, collateral1, splitCompany]);
  }
  if (splitCurrency > 0n) {
    await approve(currency, CATEGORICAL_ROUTER, splitCurrency);
    await send(`split ${fmt(splitCurrency)} ${currencySymbol}`, router, 'splitPosition', [proposalAddress, collateral2, splitCurrency]);
  }

  for (const p of plan) {
    const [token0, token1, amount0, amount1] = p.tokenA.toLowerCase() < p.tokenB.toLowerCase()
      ? [p.tokenA, p.tokenB, p.amountA, p.amountB] : [p.tokenB, p.tokenA, p.amountB, p.amountA];
    await approve(token0, POSITION_MGR, amount0);
    await approve(token1, POSITION_MGR, amount1);
    // Does nothing to the price of a pool that already exists without liquidity.
    await send(`create ${p.label}`, positionManager, 'createAndInitializePoolIfNecessary', [token0, token1, sqrtPriceX96(amount0, amount1)]);
    const address = await factory.poolByPair(token0, token1);
    let spacing = 60;
    try { spacing = Number(await pool(address).tickSpacing()); } catch {}
    await send(`mint ${p.label}`, positionManager, 'mint', [{
      token0, token1,
      tickLower: Math.ceil(-MAX_TICK / spacing) * spacing,
      tickUpper: Math.floor(MAX_TICK / spacing) * spacing,
      amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0, amount1Min: 0,
      recipient: wallet.address, deadline: deadline(),
    }]);
    console.log(`  ${p.label}: ${address}`);
  }
  console.log('Done.');
}

main().catch((error) => { console.error("ERROR", error.shortMessage || error.reason || error.message); if (process.env.DEBUG) console.error(error); process.exit(1); });
