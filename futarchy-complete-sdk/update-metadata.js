import { createPublicClient, createWalletClient, http } from 'viem';
import { gnosis } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

// Contract Addresses & Setup
const RPC_URL = 'https://rpc.gnosischain.com';
const GRAPHQL_URL = process.env.REGISTRY_GRAPHQL_URL
    || `${process.env.FUTARCHY_API_URL || 'https://api.futarchy.fi'}/registry/graphql`;
const TARGET_PROPOSAL = "0x2C1e08674f3F78f8a1426a41C41B8BF546fA481a".toLowerCase();

// ProposalMetadata ABI snippet
const PROPOSAL_ABI = [{
    "inputs": [
        { "internalType": "string", "name": "_metadata", "type": "string" },
        { "internalType": "string", "name": "_metadataURI", "type": "string" }
    ],
    "name": "updateExtendedMetadata",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}];

// Viem Setup
let privateKey = process.env.PRIVATE_KEY;
if (!privateKey) { console.error("Missing PRIVATE_KEY"); process.exit(1); }
if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: gnosis, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: gnosis, transport: http(RPC_URL) });

async function updateProposal() {
    console.log(`\n========================================`);
    console.log(`Updating Proposal Metadata for: ${TARGET_PROPOSAL}`);
    console.log(`========================================`);

    // 1. Fetch current metadata from registry
    const query = `{
        proposalentities(where: { proposalAddress: "${TARGET_PROPOSAL}" }, first: 1) {
            id
            proposalAddress
            metadata
        }
    }`;

    console.log(`\n🔍 Fetching current metadata from registry...`);
    let existingData;
    try {
        const response = await fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const result = await response.json();
        const entities = result?.data?.proposalentities;

        if (!entities || entities.length === 0) {
            console.error(`❌ Proposal not found in canonical registry.`);
            process.exit(1);
        }
        existingData = entities[0];
    } catch (e) {
        console.error(`Failed to query registry:`, e.message);
        process.exit(1);
    }

    const metadataContractAddress = existingData.id;
    console.log(`✅ Found Metadata Contract: ${metadataContractAddress}`);

    // 2. Parse & Modify JSON
    let metadataObj = {};
    if (existingData.metadata) {
        try {
            metadataObj = JSON.parse(existingData.metadata);
        } catch (e) {
            console.warn("Could not parse existing metadata cleanly.", e.message);
        }
    }

    // Append standard target data without removing existing properties
    metadataObj.snapshot_id = "0x57853565aa27e14788f9533e9b788b20473b4e81711a16bef0b7210e3fa8a900";

    // Nov 19, 2025 · 8:52 AM horario utc-3 
    // UTC-3 means the actual UTC time is 3 hours ahead: 11:52 AM UTC
    const targetDate = new Date("2025-11-19T11:52:00Z");
    const unixTimestamp = Math.floor(targetDate.getTime() / 1000);

    // Storing as both for UI safety
    metadataObj.startCandleUnix = unixTimestamp;
    metadataObj.closeTimestamp = unixTimestamp;

    // Apply flat display properties based on the other Kleros DAO proposal
    if (metadataObj.display) {
        delete metadataObj.display;
    }

    metadataObj.display_main = 1;
    metadataObj.display_price = 4;
    metadataObj.display_amount = 6;
    metadataObj.display_balance = 4;
    metadataObj.display_default = 4;
    metadataObj.display_swapPrice = 4;
    metadataObj.display_percentage = 1;
    metadataObj.display_smallNumbers = 8;

    const newMetadataString = JSON.stringify(metadataObj);

    console.log(`\n📦 New Appended Metadata JSON:`);
    console.log(JSON.stringify(metadataObj, null, 2));

    const isDryRun = process.argv.includes('--dry-run');

    if (isDryRun) {
        console.log(`\n🛑 [DRY RUN] Transaction would be sent with:`);
        console.log(`  function: updateExtendedMetadata`);
        console.log(`  args: [`);
        console.log(`    '${newMetadataString}',`);
        console.log(`    ""`);
        console.log(`  ]`);
        return;
    }

    // 3. Send Transaction
    console.log(`\n🚀 Sending Update Transaction...`);
    try {
        const hash = await walletClient.writeContract({
            address: metadataContractAddress,
            abi: PROPOSAL_ABI,
            functionName: 'updateExtendedMetadata',
            args: [newMetadataString, ""]
        });

        console.log(`⏳ Transaction sent! Hash: ${hash}`);
        console.log(`   Waiting for confirmation...`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`🎉 SUCCESS! Transaction confirmed in block ${receipt.blockNumber}`);
    } catch (e) {
        console.error(`💥 Transaction failed:`, e.details || e.message);
    }
}

updateProposal();
