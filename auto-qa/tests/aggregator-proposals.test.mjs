import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// fetchProposalsFromAggregator builds every homepage card. Evaluate it with
// its real lifecycle and on-chain-resolution helpers inlined, and stub only
// the network edges: the registry snapshot, the candles indexer (global
// fetch) and the RPC provider.

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../src');
const read = (path) => readFile(resolve(src, path), 'utf8');

const stripImports = (code) => code.replace(/^import[\s\S]*?;\s*$/gm, '');

const hookSource = stripImports(await read('hooks/useAggregatorProposals.js'))
    .replace('export default useAggregatorProposals;', '');
const lifecycleSource = await read('utils/proposalLifecycle.js');
const resolutionSource = stripImports(await read('utils/onChainResolution.js'));

const harness = `
const useState = () => [null, () => {}];
const useEffect = () => {};
const getSubgraphEndpoint = (chainId) => ({
    1: 'https://api.example/candles/graphql?chainId=1',
    100: 'https://api.example/candles/graphql',
})[chainId] || null;
const cachedOnce = (_key, producer) => producer();
const fetchNestedRegistrySnapshot = async () => globalThis.__registry;
const getRpcProvider = (chainId) => globalThis.__provider(chainId);
${lifecycleSource}
${resolutionSource}
${hookSource}
`;
const hook = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(harness)}`);

const word = (n) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const GNOSIS_OPEN = '0x00000000000000000000000000000000000000a1';
const GNOSIS_RESOLVED = '0x00000000000000000000000000000000000000a2';
const MAINNET_OPEN = '0x00000000000000000000000000000000000000b1';

const proposal = (address, meta) => ({
    id: `meta-${address}`,
    proposalAddress: address,
    displayNameEvent: `Proposal ${address.slice(-2)}`,
    metadata: JSON.stringify(meta),
});

function setup() {
    globalThis.__registry = {
        organizations: [{
            id: 'org',
            name: 'Org',
            metadata: '{}',
            proposals: [
                proposal(GNOSIS_OPEN, { chain: 100 }),
                proposal(GNOSIS_RESOLVED, { chain: 100 }),
                proposal(MAINNET_OPEN, { chain: '1', closeTimestamp: 1_900_000_000 }),
            ],
        }],
    };

    const conditions = { [GNOSIS_OPEN]: word(1), [GNOSIS_RESOLVED]: word(2), [MAINNET_OPEN]: word(3) };
    const denominators = { [word(1)]: 0, [word(2)]: 1, [word(3)]: 0 };
    const rpcCalls = [];
    globalThis.__provider = (chainId) => ({
        async send(_method, [{ to, data }]) {
            rpcCalls.push({ chainId, to, data });
            if (data === '0x2ddc7de7') return conditions[to];
            const conditionId = `0x${data.slice(10, 74)}`;
            if (data.startsWith('0xdd34de67')) return word(denominators[conditionId]);
            // payoutNumerators(conditionId, slot): YES (slot 0) pays 1 when resolved, NO (slot 1) pays 0
            const slot = BigInt(`0x${data.slice(74, 138)}`);
            return word(slot === 0n ? denominators[conditionId] : 0);
        },
    });

    const graphqlCalls = [];
    globalThis.fetch = async (url, init) => {
        const { variables } = JSON.parse(init.body);
        graphqlCalls.push({ url, ids: variables.ids });
        const pools = variables.ids.flatMap((id) => [
            { id: `${id}-yes`, proposal: { id }, type: 'CONDITIONAL', outcomeSide: 'YES' },
            { id: `${id}-no`, proposal: { id }, type: 'CONDITIONAL', outcomeSide: 'NO' },
        ]);
        return { json: async () => ({ data: { pools } }) };
    };

    return { rpcCalls, graphqlCalls };
}

const byAddress = (proposals) => Object.fromEntries(proposals.map((p) => [p.proposalAddress, p]));

test('pools are fetched from each proposal\'s own chain index and merged', async () => {
    const { graphqlCalls } = setup();
    const { proposals } = await hook.fetchProposalsFromAggregator('0xagg');

    assert.equal(graphqlCalls.length, 2, 'one candles query per chain');
    const mainnetCall = graphqlCalls.find((c) => c.url.endsWith('?chainId=1'));
    assert.deepEqual(mainnetCall.ids, [MAINNET_OPEN]);
    const gnosisCall = graphqlCalls.find((c) => !c.url.includes('chainId='));
    assert.deepEqual(gnosisCall.ids.sort(), [GNOSIS_OPEN, GNOSIS_RESOLVED]);

    const mainnet = byAddress(proposals)[MAINNET_OPEN];
    assert.equal(mainnet.chainId, 1);
    assert.deepEqual(mainnet.poolAddresses, { yes: `${MAINNET_OPEN}-yes`, no: `${MAINNET_OPEN}-no` });
});

test('proposals resolved on-chain are marked resolved despite stale metadata', async () => {
    const { rpcCalls } = setup();
    const { proposals } = await hook.fetchProposalsFromAggregator('0xagg');
    const p = byAddress(proposals);

    assert.equal(p[GNOSIS_RESOLVED].status, 'resolved');
    assert.equal(p[GNOSIS_RESOLVED].resolutionStatus, 'resolved');
    assert.equal(p[GNOSIS_RESOLVED].resolutionOutcome, 'yes');
    assert.equal(p[GNOSIS_RESOLVED].isClosed, true);
    assert.equal(p[GNOSIS_OPEN].status, 'ongoing');
    assert.equal(p[MAINNET_OPEN].status, 'ongoing');

    // conditionId + denominator + YES and NO numerators per proposal, on its own chain.
    assert.equal(rpcCalls.length, 12);
    assert.equal(rpcCalls.filter((c) => c.chainId === 1).length, 4);
});

test('a proposal without a close time gets no invented deadline', async () => {
    setup();
    const { proposals } = await hook.fetchProposalsFromAggregator('0xagg');
    const p = byAddress(proposals);

    assert.equal(p[GNOSIS_OPEN].endTime, null);
    assert.equal(p[MAINNET_OPEN].endTime, 1_900_000_000);
});

test('metadata that already records the outcome skips the on-chain read', async () => {
    const { rpcCalls } = setup();
    globalThis.__registry.organizations[0].proposals = [
        proposal(GNOSIS_RESOLVED, { chain: 100, resolution_status: 'resolved', resolution_outcome: 'no' }),
    ];
    const { proposals } = await hook.fetchProposalsFromAggregator('0xagg');

    assert.equal(rpcCalls.length, 0);
    assert.equal(proposals[0].resolutionOutcome, 'no');
});
