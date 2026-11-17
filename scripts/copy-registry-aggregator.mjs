#!/usr/bin/env node
// Copies the organizations and proposals of one registry aggregator (by
// default futarchy.fi's) into an aggregator we own, on Gnosis.
//
// The copy is new metadata contracts that point at the same trading
// contracts: one Organization per source organization and one
// ProposalMetadata per proposal, with the same names, descriptions and
// metadata JSON. The source contracts are not touched, and the copies are
// owned by the wallet that sends the transactions, so they can be edited and
// can get proposals of their own (categorical ones) later.
//
// Each copied organization records its source in its metadata JSON
// (`copiedFrom`), so running the script again only copies what is missing:
// organizations and proposals the source added since. The target is read
// on-chain, not from the indexer, so a run right after another one does not
// copy anything twice. Archived organizations and proposals are skipped.
//
// The registry indexer (futarchy-complete subgraph) indexes every aggregator
// created through the Creator below, so a new aggregator shows up in
// https://api.futarchy.seer.pm/registry/graphql without indexer changes.
// To see it in the app, build or run it with
// NEXT_PUBLIC_FUTARCHY_AGGREGATOR=<target aggregator>.
//
// Usage:
//   node scripts/copy-registry-aggregator.mjs --create-aggregator "<name>" [--description "<text>"] [--send]
//   node scripts/copy-registry-aggregator.mjs --target <aggregator> [--send]
//     --source <aggregator>  aggregator to copy (default: futarchy.fi's)
//     --send                 send the transactions; without it the script
//                            only prints the plan
// Reads PRIVATE_KEY (needed for --send; the wallet must own or edit the
// target aggregator) and RPC_URL from the environment or .env.
import 'dotenv/config';
import { ethers } from 'ethers';

const REGISTRY_URL = process.env.REGISTRY_GRAPHQL_URL || 'https://api.futarchy.seer.pm/registry/graphql';
const RPC_URL = process.env.RPC_URL || 'https://rpc.gnosischain.com';
const FUTARCHY_FI_AGGREGATOR = '0xC5eB43D53e2FE5FddE5faf400CC4167e5b5d4Fc1';
// Creator (aggregator factory) the registry indexer listens to.
const AGGREGATOR_CREATOR = '0xe7C27c932C80D30c9aaA30A856c0062208d269b4';

const CREATOR_ABI = [
  'function createAggregatorMetadata(string aggregatorName, string description, string metadata, string metadataURI) returns (address)',
  'event AggregatorMetadataCreated(address indexed metadata, string name)',
];
const AGGREGATOR_ABI = [
  'function owner() view returns (address)',
  'function editor() view returns (address)',
  'function getOrganizationsCount() view returns (uint256)',
  'function getOrganizations(uint256 offset, uint256 limit) view returns (address[])',
  'function createAndAddOrganizationMetadata(string companyName, string description, string metadata, string metadataURI) returns (address)',
  'event OrganizationCreatedAndAdded(address indexed organizationMetadata, string companyName)',
];
const ORGANIZATION_ABI = [
  'function metadata() view returns (string)',
  'function getProposalsCount() view returns (uint256)',
  'function getProposals(uint256 offset, uint256 limit) view returns (address[])',
  'function createAndAddProposalMetadata(address proposalAddress, string displayNameQuestion, string displayNameEvent, string description, string metadata, string metadataURI) returns (address)',
  'event ProposalCreatedAndAdded(address indexed proposalMetadata, address indexed proposalAddress)',
];
const PROPOSAL_METADATA_ABI = ['function proposalAddress() view returns (address)'];

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const SEND = args.includes('--send');
const source = (option('source') || FUTARCHY_FI_AGGREGATOR).toLowerCase();
const target = option('target');
const newAggregatorName = option('create-aggregator');
if (!target === !newAggregatorName || (target && !ethers.utils.isAddress(target))) {
  console.error('Usage: node scripts/copy-registry-aggregator.mjs (--create-aggregator "<name>" [--description "<text>"] | --target <aggregator>) [--source <aggregator>] [--send]');
  process.exit(1);
}
if (SEND && !process.env.PRIVATE_KEY) throw new Error('--send needs PRIVATE_KEY');

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const signer = SEND ? new ethers.Wallet(process.env.PRIVATE_KEY, provider) : null;
const contract = (address, abi) => new ethers.Contract(address, abi, signer || provider);

const parseJson = (text) => {
  try { return JSON.parse(text || '{}') || {}; } catch { return {}; }
};
const isArchived = (metadata) => metadata.archived === true || metadata.archived === 'true';

async function fetchSource(aggregatorId) {
  const query = `query ($id: String!) {
    aggregator(id: $id) { id name }
    organizations(where: { aggregator: $id }, first: 1000) { id name description metadata metadataURI }
    proposalEntities(where: { organization_: { aggregator: $id } }, first: 1000) {
      id proposalAddress displayNameQuestion displayNameEvent description metadata metadataURI organization { id }
    }
  }`;
  const res = await fetch(REGISTRY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id: aggregatorId } }),
  });
  const { data, errors } = await res.json();
  if (errors) throw new Error(`Registry query failed: ${JSON.stringify(errors)}`);
  if (!data.aggregator) throw new Error(`Aggregator ${aggregatorId} is not in the registry`);
  return data;
}

// Every address of a paginated registry list (getOrganizations / getProposals).
async function readList(instance, countFn, listFn) {
  const count = (await instance[countFn]()).toNumber();
  return count ? instance[listFn](0, count) : [];
}

// Source organization id -> { address, proposals: Set of trading addresses }
// for the organizations already copied into the target.
async function readTarget(aggregatorAddress) {
  const copies = new Map();
  const aggregator = contract(aggregatorAddress, AGGREGATOR_ABI);
  for (const orgAddress of await readList(aggregator, 'getOrganizationsCount', 'getOrganizations')) {
    const org = contract(orgAddress, ORGANIZATION_ABI);
    const copiedFrom = parseJson(await org.metadata()).copiedFrom;
    if (!copiedFrom) continue;
    const metadataAddresses = await readList(org, 'getProposalsCount', 'getProposals');
    const tradingAddresses = await Promise.all(metadataAddresses.map((address) => contract(address, PROPOSAL_METADATA_ABI).proposalAddress()));
    copies.set(copiedFrom.toLowerCase(), { address: orgAddress, proposals: new Set(tradingAddresses.map((a) => a.toLowerCase())) });
  }
  return copies;
}

// Sends a transaction and returns the first address argument of `eventName`
// in its receipt: the contract it created.
async function sendAndFind(instance, fn, fnArgs, eventName) {
  const tx = await instance[fn](...fnArgs);
  console.log(`    tx ${tx.hash}`);
  const receipt = await tx.wait();
  const log = receipt.logs
    .filter((entry) => entry.address.toLowerCase() === instance.address.toLowerCase())
    .map((entry) => { try { return instance.interface.parseLog(entry); } catch { return null; } })
    .find((parsed) => parsed?.name === eventName);
  if (!log) throw new Error(`${eventName} not found in ${tx.hash}`);
  return log.args[0];
}

const src = await fetchSource(source);
const orgs = src.organizations.filter((org) => !isArchived(parseJson(org.metadata)));
const proposalsByOrg = new Map(orgs.map((org) => [org.id, []]));
for (const proposal of src.proposalEntities) {
  if (isArchived(parseJson(proposal.metadata))) continue;
  proposalsByOrg.get(proposal.organization?.id)?.push(proposal);
}

let targetAddress = target;
if (target) {
  const aggregator = contract(target, AGGREGATOR_ABI);
  const [owner, editor] = await Promise.all([aggregator.owner(), aggregator.editor()]);
  console.log(`Target aggregator ${target} (owner ${owner}, editor ${editor})`);
  if (signer && ![owner, editor].some((a) => a.toLowerCase() === signer.address.toLowerCase())) {
    throw new Error(`${signer.address} is neither owner nor editor of ${target}`);
  }
}
const copies = target ? await readTarget(target) : new Map();

console.log(`Source aggregator ${source} (${src.aggregator.name}): ${orgs.length} organizations, ${[...proposalsByOrg.values()].flat().length} proposals (archived ones skipped)`);
console.log(SEND ? `Sending from ${signer.address}\n` : 'Dry run: nothing is sent (add --send to send)\n');

if (newAggregatorName) {
  const description = option('description') || newAggregatorName;
  console.log(`+ aggregator "${newAggregatorName}" through Creator ${AGGREGATOR_CREATOR}`);
  if (SEND) {
    targetAddress = await sendAndFind(contract(AGGREGATOR_CREATOR, CREATOR_ABI), 'createAggregatorMetadata', [newAggregatorName, description, '{}', ''], 'AggregatorMetadataCreated');
    console.log(`    aggregator ${targetAddress}`);
  }
}

let planned = 0;
for (const org of orgs) {
  const copy = copies.get(org.id);
  const missing = proposalsByOrg.get(org.id).filter((p) => !copy?.proposals.has(p.proposalAddress.toLowerCase()));
  if (copy && missing.length === 0) continue;

  let orgAddress = copy?.address;
  if (!copy) {
    planned++;
    console.log(`+ organization "${org.name}" (copy of ${org.id})`);
    if (SEND) {
      const metadata = JSON.stringify({ ...parseJson(org.metadata), copiedFrom: org.id });
      orgAddress = await sendAndFind(contract(targetAddress, AGGREGATOR_ABI), 'createAndAddOrganizationMetadata', [org.name, org.description, metadata, org.metadataURI || ''], 'OrganizationCreatedAndAdded');
      console.log(`    organization ${orgAddress}`);
    }
  } else {
    console.log(`= organization "${org.name}" already copied as ${copy.address}`);
  }

  for (const p of missing) {
    planned++;
    console.log(`  + proposal ${p.proposalAddress} "${(p.displayNameQuestion || p.displayNameEvent).slice(0, 70)}"`);
    if (SEND) {
      const metadataAddress = await sendAndFind(contract(orgAddress, ORGANIZATION_ABI), 'createAndAddProposalMetadata',
        [p.proposalAddress, p.displayNameQuestion, p.displayNameEvent, p.description, p.metadata || '{}', p.metadataURI || ''], 'ProposalCreatedAndAdded');
      console.log(`    proposal metadata ${metadataAddress}`);
    }
  }
}

console.log(`\n${planned} ${SEND ? 'created' : 'to create'}${newAggregatorName ? ' (plus the aggregator)' : ''}.`);
if (SEND && targetAddress) console.log(`Run the app with NEXT_PUBLIC_FUTARCHY_AGGREGATOR=${targetAddress}`);
