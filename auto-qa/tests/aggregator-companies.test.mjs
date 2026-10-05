import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// fetchCompaniesFromAggregator builds the organizations table. Evaluate it
// with the real lifecycle helpers inlined and stub the edges: the registry
// snapshot and the on-chain resolution read it shares with the proposal lists.

const read = (path) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const stripImports = (code) => code.replace(/^import[\s\S]*?;\s*$/gm, '');

const hookSource = stripImports(await read('hooks/useAggregatorCompanies.js'))
    .replace('export default useAggregatorCompanies;', '');
const lifecycleSource = await read('utils/proposalLifecycle.js');

const harness = `
const useState = () => [null, () => {}];
const useEffect = () => {};
const useCallback = (fn) => fn;
const getFlmPathForOrg = () => null;
const fetchRegistrySnapshot = async () => globalThis.__registry;
const resolutionKey = (chainId, address) => \`\${Number(chainId) === 1 ? 1 : 100}:\${String(address).toLowerCase()}\`;
const detectProposalChain = (proposalMeta, orgMeta) => parseInt(proposalMeta.chain || orgMeta.chain || 100);
const fetchUnsettledResolutions = (proposals) => globalThis.__resolutions(proposals);
${lifecycleSource}
${hookSource}
`;
const hook = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(harness)}`);

const FUTURE = Math.floor(Date.now() / 1000) + 86_400;
const PAST = Math.floor(Date.now() / 1000) - 86_400;
const OPEN = '0x00000000000000000000000000000000000000a1';
const RESOLVED_ON_CHAIN = '0x00000000000000000000000000000000000000a2';
const ENDED = '0x00000000000000000000000000000000000000a3';
const RESOLVED_IN_REGISTRY = '0x00000000000000000000000000000000000000a4';
const ARCHIVED = '0x00000000000000000000000000000000000000a5';

const proposal = (address, meta) => ({
    id: `meta-${address}`,
    proposalAddress: address,
    metadata: JSON.stringify(meta),
    organization: { id: 'org' },
});

function setup() {
    globalThis.__registry = {
        aggregator: { id: '0xagg', name: 'Aggregator' },
        organizations: [{ id: 'org', name: 'Org', metadata: '{}' }],
        proposalEntities: [
            proposal(OPEN, { closeTimestamp: FUTURE }),
            // no close time and nothing recorded: only the chain knows it resolved
            proposal(RESOLVED_ON_CHAIN, {}),
            proposal(ENDED, { closeTimestamp: PAST }),
            proposal(RESOLVED_IN_REGISTRY, { closeTimestamp: FUTURE, resolution_status: 'resolved', resolution_outcome: 'yes' }),
            proposal(ARCHIVED, { archived: true }),
        ],
    };
}

test('a market resolved on-chain is not counted as active, whatever its metadata says', async () => {
    setup();
    let asked;
    globalThis.__resolutions = async (proposals) => {
        asked = proposals.map((p) => p.proposalAddress);
        return new Map([[`100:${RESOLVED_ON_CHAIN}`, { resolved: true, outcome: 'yes' }]]);
    };

    const { companies } = await hook.fetchCompaniesFromAggregator('0xagg');

    assert.equal(companies[0].proposalsCount, 4, 'archived proposals are not counted at all');
    assert.equal(companies[0].activeProposals, 1, 'only the open market is active');
    assert.deepEqual(asked, [OPEN, RESOLVED_ON_CHAIN, ENDED, RESOLVED_IN_REGISTRY]);
});

test('the active count falls back to metadata when the on-chain read fails', async () => {
    setup();
    globalThis.__resolutions = async () => { throw new Error('rpc down'); };

    const { companies } = await hook.fetchCompaniesFromAggregator('0xagg');

    assert.equal(companies[0].proposalsCount, 4);
    assert.equal(companies[0].activeProposals, 2);
});
