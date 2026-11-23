#!/usr/bin/env node
// Creates a categorical futarchy proposal that can grow, with the "Other" trick
// of Seer's create-other-chain-markets.ts: every proposal ends with an "Other"
// answer, and adding candidates later creates a new proposal on that "Other"
// (parentMarket / parentOutcome), with the new candidates plus its own "Other".
// The market page shows the whole chain as one market and hides every "Other"
// that a later proposal follows up (src/utils/proposalFamily.js).
//
// Usage:
//   First proposal:
//     node categorical-other-chain.js --question "<question>" --answer "<A>" --answer "<B>" [options]
//       --company <address>    collateralToken1 (default PNK on Gnosis)
//       --currency <address>   collateralToken2 (default sDAI on Gnosis)
//       --min-bond <xDAI>      Reality min bond (default 1)
//       --category <name>      Reality category (default governance)
//       --language <code>      Reality language (default en)
//       --opening-time <unix>  when Reality accepts answers (default: now, as Seer's script)
//   More candidates:
//     node categorical-other-chain.js --parent <any proposal of the chain> --answer "<C>" [--answer ...]
//       The new proposal follows up the "Other" of the chain's last proposal, and
//       takes its question, collaterals, bond, category, language and opening
//       time, so every proposal of the chain asks the same question.
//   Without --send the script prints the plan and estimates the gas; with
//   --send it creates the proposal. The sent transaction is saved in
//   tmp/categorical-other-chain.pending.json until it is mined, so a run that
//   stopped while it was pending waits for it instead of sending it again.
// Reads PRIVATE_KEY and RPC_URL from the environment or .env, like algebra-cli.js;
// CATEGORICAL_FACTORY_ADDRESS overrides the factory.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'https://rpc.gnosischain.com';
const FACTORY = process.env.CATEGORICAL_FACTORY_ADDRESS || '0x4e79be3a63b09d22D4DAfcd66Feb00535A654295';
const PNK = '0x37b60f4E9A31A64cCc0024dce7D0fD07eAA0F7B3';
const SDAI = '0xaf204776c7245bF4147c2612BF6e5972Ee483701';
const OTHER = 'Other';
// Reality.eth separates question, answers, category and language with it.
const SEPARATOR = '\u241f';

const PENDING_FILE = path.join(__dirname, 'tmp', 'categorical-other-chain.pending.json');

// Unknown flags, and a flag where a value is expected (--answer --send), are
// errors: a mistyped command must not create a proposal.
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
let args;
try {
  ({ values: args } = parseArgs({
    strict: true,
    options: {
      question: { type: 'string' },
      answer: { type: 'string', multiple: true },
      parent: { type: 'string' },
      company: { type: 'string' },
      currency: { type: 'string' },
      'min-bond': { type: 'string' },
      category: { type: 'string' },
      language: { type: 'string' },
      'opening-time': { type: 'string' },
      send: { type: 'boolean', default: false },
    },
  }));
} catch (error) {
  fail(error.message);
}
for (const [name, value] of Object.entries(args)) {
  for (const item of [value].flat()) {
    if (typeof item === 'string' && (item.startsWith('--') || !item.trim())) fail(`--${name} needs a value.`);
  }
}
const option = (name, fallback) => args[name] ?? fallback;
const answers = (args.answer ?? []).map((answer) => answer.trim());
const SEND = args.send;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY, provider) : null;

const factory = new ethers.Contract(FACTORY, [
  'function createProposal((string,string[],string[],address,address,string,string,uint256,uint32,address,uint256)) returns (address)',
  'function marketsCount() view returns (uint256)',
  'function proposals(uint256) view returns (address)',
  'function realitio() view returns (address)',
  'event NewProposal(address indexed proposal, string marketName, address parentMarket, bytes32 conditionId, bytes32 questionId)',
], wallet ?? provider);
const proposalAt = (address) => new ethers.Contract(address, [
  'function marketName() view returns (string)',
  'function numOutcomes() view returns (uint256)',
  'function outcomes(uint256) view returns (string)',
  'function collateralToken1() view returns (address)',
  'function collateralToken2() view returns (address)',
  'function questionId() view returns (bytes32)',
  'function encodedQuestion() view returns (string)',
  'function parentMarket() view returns (address)',
  'function parentOutcome() view returns (uint256)',
], provider);
const symbolOf = (address) => new ethers.Contract(address, ['function symbol() view returns (string)'], provider).symbol();

// Reality stores answers escaped as inside a JSON string.
const unescape = (text) => JSON.parse(`"${text}"`);

async function answersOf(address) {
  const proposal = proposalAt(address);
  const count = Number(await proposal.numOutcomes());
  return Promise.all(Array.from({ length: count }, async (_, i) => unescape(await proposal.outcomes(i))));
}

/**
 * The proposals of the factory chained to another one, as "parent:outcome" ->
 * children in creation order. The market page follows the first child of an
 * answer and ignores the rest (src/utils/proposalFamily.js).
 */
async function chainedProposals() {
  const count = Number(await factory.marketsCount());
  const addresses = await Promise.all(Array.from({ length: count }, (_, i) => factory.proposals(i)));
  const links = await Promise.all(addresses.map(async (address) => {
    const proposal = proposalAt(address);
    const parent = await proposal.parentMarket();
    return parent === ethers.ZeroAddress ? null : `${parent.toLowerCase()}:${await proposal.parentOutcome()}`;
  }));
  const children = new Map();
  addresses.forEach((address, i) => {
    if (links[i]) children.set(links[i], [...(children.get(links[i]) ?? []), address]);
  });
  return children;
}

/**
 * The chain from its root down to its last proposal, following each "Other".
 * `start` can be any proposal of the chain: the root is found through parentMarket.
 */
async function chainOf(start) {
  let root = start;
  for (;;) {
    const parent = await proposalAt(root).parentMarket();
    if (parent === ethers.ZeroAddress) break;
    root = parent;
  }
  const children = await chainedProposals();
  const chain = [];
  for (let address = root; address;) {
    const outcomes = await answersOf(address);
    const otherIndex = outcomes.findIndex((answer) => answer.toLowerCase() === OTHER.toLowerCase());
    chain.push({ address, outcomes, otherIndex });
    const next = otherIndex >= 0 ? children.get(`${address.toLowerCase()}:${otherIndex}`) ?? [] : [];
    if (next.length > 1) {
      console.warn(`Warning: ${next.length} proposals follow up "${OTHER}" of ${address}; the market shows the first, ${next[0]}, and so does this script.`);
    }
    address = next[0];
  }
  if (!chain.some(({ address }) => address.toLowerCase() === start.toLowerCase())) {
    throw new Error(`${start} is not on the chain the market shows: another proposal already follows up the same answer.`);
  }
  return chain;
}

async function main() {
  if (await settlePending()) return;
  const { buildCategoricalProposal, estimateCategoricalGas } = await import('../src/utils/categoricalProposal.mjs');
  if (answers.length === 0) throw new Error('Pass the candidates with --answer, one per candidate.');
  if (answers.some((answer) => answer.toLowerCase() === OTHER.toLowerCase())) {
    throw new Error(`"${OTHER}" is added by the script; pass only the candidates.`);
  }

  let input;
  let chain = [];
  const parentArg = option('parent');
  if (parentArg) {
    if (!ethers.isAddress(parentArg)) throw new Error('--parent is not an address.');
    chain = await chainOf(ethers.getAddress(parentArg));
    const last = chain[chain.length - 1];
    if (last.otherIndex < 0) throw new Error(`${last.address} has no "${OTHER}" answer to follow up.`);
    const taken = chain.flatMap(({ outcomes }) => outcomes).map((answer) => answer.toLowerCase());
    const repeated = answers.filter((answer) => taken.includes(answer.toLowerCase()));
    if (repeated.length > 0) throw new Error(`Already candidates in the chain: ${repeated.join(', ')}.`);

    const parent = proposalAt(last.address);
    const realitio = new ethers.Contract(await factory.realitio(), [
      'function getMinBond(bytes32) view returns (uint256)',
      'function getOpeningTS(bytes32) view returns (uint32)',
    ], provider);
    const questionId = await parent.questionId();
    const [, , category, language] = (await parent.encodedQuestion()).split(SEPARATOR);
    input = {
      marketName: await parent.marketName(),
      companyToken: await parent.collateralToken1(),
      currencyToken: await parent.collateralToken2(),
      category,
      language,
      minBond: await realitio.getMinBond(questionId),
      openingTime: Number(await realitio.getOpeningTS(questionId)),
      parentMarket: last.address,
      parentOutcome: last.otherIndex,
    };
  } else {
    input = {
      marketName: option('question'),
      companyToken: option('company', PNK),
      currencyToken: option('currency', SDAI),
      category: option('category', 'governance'),
      language: option('language', 'en'),
      minBond: ethers.parseEther(option('min-bond', '1')),
      openingTime: Number(option('opening-time', Math.floor(Date.now() / 1000))),
    };
  }

  // The "Other" tokens of each level get their own name (OTHER, OTHER2, ...),
  // so a wallet or DEX tells them apart.
  const otherTokenName = chain.length === 0 ? 'OTHER' : `OTHER${chain.length + 1}`;
  const outcomes = [...answers, OTHER];
  const { errors, tokenNames, params } = buildCategoricalProposal({
    ...input,
    outcomes,
    tokenNames: [...answers.map(() => ''), otherTokenName],
    companySymbol: await symbolOf(input.companyToken),
    currencySymbol: await symbolOf(input.currencyToken),
  });
  if (errors.length > 0) throw new Error(errors.join('\n'));

  console.log(`Factory: ${FACTORY}`);
  console.log(`Question: ${input.marketName}`);
  chain.forEach(({ address, outcomes: levelAnswers }, level) => console.log(`  level ${level + 1}: ${address} [${levelAnswers.join(', ')}]`));
  console.log(`New proposal${chain.length ? ` (level ${chain.length + 1}, follows up "${OTHER}" of ${input.parentMarket})` : ''}:`);
  outcomes.forEach((answer, i) => console.log(`  ${i}. ${answer} (${tokenNames[i]})`));
  console.log(`  ${outcomes.length}. Invalid`);
  console.log(`Collaterals: ${input.companyToken} / ${input.currencyToken}`);
  console.log(`Reality: category ${input.category}, language ${input.language}, min bond ${ethers.formatEther(input.minBond)}, opens ${new Date(input.openingTime * 1000).toISOString()}`);

  const from = wallet?.address;
  const gas = await provider.estimateGas({ from, to: FACTORY, data: factory.interface.encodeFunctionData('createProposal', [params]) });
  // 20% over the estimate, but never more than a block holds or the
  // per-transaction cap of EIP-7825 (2^24, as Seer's script): a transaction
  // with a larger limit is never included.
  const { gasLimit: blockGasLimit } = await provider.getBlock('latest');
  const cap = blockGasLimit < 16_777_216n ? blockGasLimit : 16_777_216n;
  if (gas > (cap * 95n) / 100n) {
    throw new Error(`createProposal needs ${gas} gas, too close to the ${cap} cap: use fewer answers.`);
  }
  const buffered = (gas * 12n) / 10n;
  const gasLimit = buffered < cap ? buffered : cap;
  console.log(`Estimated gas: ${gas} (about ${estimateCategoricalGas(outcomes.length)} expected), gas limit ${gasLimit}`);
  if (!SEND) {
    console.log('\nDry run: pass --send to create the proposal.');
    return;
  }
  if (!wallet) throw new Error('PRIVATE_KEY is required with --send.');

  const tx = await factory.createProposal(params, { gasLimit });
  fs.mkdirSync(path.dirname(PENDING_FILE), { recursive: true });
  fs.writeFileSync(PENDING_FILE, JSON.stringify({ hash: tx.hash, factory: FACTORY, outcomes, parentMarket: input.parentMarket ?? null }, null, 2));
  console.log(`tx ${tx.hash}`);
  await reportMined(tx.hash);
}

/** Waits for a createProposal transaction and prints the proposal it created. */
async function reportMined(hash) {
  const receipt = await provider.waitForTransaction(hash);
  fs.rmSync(PENDING_FILE, { force: true });
  if (receipt.status !== 1) throw new Error(`createProposal reverted: ${hash}`);
  const event = receipt.logs
    .map((log) => { try { return factory.interface.parseLog(log); } catch { return null; } })
    .find((parsed) => parsed?.name === 'NewProposal');
  console.log(`Proposal: ${event.args.proposal} (block ${receipt.blockNumber})`);
}

/**
 * A transaction a previous run sent and did not see mined is waited for
 * before anything else: sending again would create the proposal twice. One
 * the node no longer knows was dropped, and the run goes on.
 * @returns {Promise<boolean>} whether a pending transaction was settled
 */
async function settlePending() {
  if (!fs.existsSync(PENDING_FILE)) return false;
  const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
  if (!await provider.getTransaction(pending.hash)) {
    console.log(`${pending.hash} from a previous run is unknown to the node (dropped); continuing.`);
    fs.rmSync(PENDING_FILE, { force: true });
    return false;
  }
  console.log(`Waiting for ${pending.hash}, sent by a previous run for [${pending.outcomes.join(', ')}]...`);
  await reportMined(pending.hash);
  console.log('Run the command again to create another proposal.');
  return true;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
