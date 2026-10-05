import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const source = await readFile(resolve(root, 'src/utils/onChainResolution.js'), 'utf8');

// Strip the provider import so Node can evaluate the module in isolation;
// every test injects its own provider.
const testableSource = source.replace(
    "import { getRpcProvider } from './getBestRpc';",
    'const getRpcProvider = () => { throw new Error("no provider in tests"); };'
);
const resolution = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(testableSource)}`);
const { fetchOnChainResolutions, resolutionKey, CONDITIONAL_TOKENS_BY_CHAIN } = resolution;

const { ethers } = createRequire(resolve(root, 'package.json'))('ethers');

const word = (n) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const RESOLVED_YES = '0x0000000000000000000000000000000000000a01';
const RESOLVED_NO = '0x0000000000000000000000000000000000000a02';
const OPEN = '0x0000000000000000000000000000000000000a03';
const MAINNET = '0x0000000000000000000000000000000000000b01';
const BROKEN = '0x0000000000000000000000000000000000000c01';
const INVALID = '0x0000000000000000000000000000000000000a04';

// Chain state: proposal -> conditionId, conditionId -> [denominator, yesNumerator, noNumerator]
const conditionIds = {
    [RESOLVED_YES]: word(1), [RESOLVED_NO]: word(2), [OPEN]: word(3), [MAINNET]: word(4), [INVALID]: word(5),
};
const payouts = {
    [word(1)]: [1, 1, 0], [word(2)]: [1, 0, 1], [word(3)]: [0, 0, 0], [word(4)]: [1, 1, 0], [word(5)]: [2, 1, 1],
};

function fakeProvider(chainId, log) {
    const iface = new ethers.utils.Interface([
        'function payoutDenominator(bytes32) view returns (uint256)',
        'function payoutNumerators(bytes32, uint256) view returns (uint256)',
    ]);
    return {
        async send(method, [{ to, data }]) {
            log.push({ chainId, method, to, data });
            if (data === '0x2ddc7de7') {
                if (!conditionIds[to]) throw new Error('execution reverted');
                return conditionIds[to];
            }
            const fn = iface.getFunction(data.slice(0, 10));
            const args = iface.decodeFunctionData(fn, data);
            const [denominator, yes, no] = payouts[args[0]];
            if (fn.name === 'payoutDenominator') return word(denominator);
            return word(Number(args[1]) === 0 ? yes : no);
        },
    };
}

test('selectors match the ConditionalTokens / FutarchyProposal signatures', () => {
    assert.match(source, new RegExp(ethers.utils.id('conditionId()').slice(0, 10)));
    assert.match(source, new RegExp(ethers.utils.id('payoutDenominator(bytes32)').slice(0, 10)));
    assert.match(source, new RegExp(ethers.utils.id('payoutNumerators(bytes32,uint256)').slice(0, 10)));
});

test('reports resolved outcome per proposal and leaves failed reads out', async () => {
    const log = [];
    const results = await fetchOnChainResolutions([
        { proposalAddress: RESOLVED_YES, chainId: 100 },
        { proposalAddress: RESOLVED_NO.toUpperCase().replace('0X', '0x'), chainId: '100' },
        { proposalAddress: OPEN, chainId: 100 },
        { proposalAddress: MAINNET, chainId: 1 },
        { proposalAddress: BROKEN, chainId: 100 },
    ], { getProvider: (chainId) => fakeProvider(chainId, log) });

    assert.deepEqual(results.get(resolutionKey(100, RESOLVED_YES)), { resolved: true, outcome: 'yes' });
    assert.deepEqual(results.get(resolutionKey(100, RESOLVED_NO)), { resolved: true, outcome: 'no' });
    assert.deepEqual(results.get(resolutionKey(100, OPEN)), { resolved: false, outcome: null });
    assert.deepEqual(results.get(resolutionKey(1, MAINNET)), { resolved: true, outcome: 'yes' });
    assert.equal(results.has(resolutionKey(100, BROKEN)), false, 'a failed read must not claim a state');

    // Each chain reads its own ConditionalTokens deployment.
    const payoutReads = log.filter((call) => call.data !== '0x2ddc7de7');
    assert.ok(payoutReads.filter((c) => c.chainId === 1)
        .every((c) => c.to === CONDITIONAL_TOKENS_BY_CHAIN[1].toLowerCase()));
    assert.ok(payoutReads.filter((c) => c.chainId === 100)
        .every((c) => c.to === CONDITIONAL_TOKENS_BY_CHAIN[100].toLowerCase()));
});

test('issues every read of a round in the same tick so the batch provider shares one POST', async () => {
    const ticks = [];
    let tick = 0;
    const provider = fakeProvider(100, []);
    const recording = {
        send(method, params) {
            ticks.push(tick);
            return provider.send(method, params);
        },
    };
    const pending = fetchOnChainResolutions(
        [RESOLVED_YES, RESOLVED_NO, OPEN].map((proposalAddress) => ({ proposalAddress, chainId: 100 })),
        { getProvider: () => recording }
    );
    // Advance a counter on every microtask turn while the check runs.
    let done = false;
    pending.then(() => { done = true; });
    while (!done) {
        tick += 1;
        await Promise.resolve();
    }
    const rounds = new Set(ticks);
    assert.equal(ticks.length, 12, '3 conditionId + 3 x (denominator, YES numerator, NO numerator)');
    assert.equal(rounds.size, 2, `expected two rounds of calls, got ticks ${ticks.join(',')}`);
});

test('dedupes, skips zero/invalid addresses, and survives a missing provider', async () => {
    const log = [];
    await fetchOnChainResolutions([
        { proposalAddress: OPEN, chainId: 100 },
        { proposalAddress: OPEN, chainId: 100 },
        { proposalAddress: '0x0000000000000000000000000000000000000000', chainId: 100 },
        { proposalAddress: 'not-an-address', chainId: 100 },
    ], { getProvider: (chainId) => fakeProvider(chainId, log) });
    assert.equal(log.filter((c) => c.data === '0x2ddc7de7').length, 1);

    const empty = await fetchOnChainResolutions([{ proposalAddress: OPEN, chainId: 100 }], {
        getProvider: () => { throw new Error('no endpoints'); },
    });
    assert.equal(empty.size, 0);
});

test('both payout slots paying out reads as invalid, never as YES', async () => {
    const results = await fetchOnChainResolutions(
        [{ proposalAddress: INVALID, chainId: 100 }],
        { getProvider: (chainId) => fakeProvider(chainId, []) }
    );
    assert.deepEqual(results.get(resolutionKey(100, INVALID)), { resolved: true, outcome: 'invalid' });
});

// --- resolution time ------------------------------------------------------

const { fetchResolutionTime } = resolution;
const REALITY_GNOSIS = '0xE78996A233895bE74a66F451f1019cA9734205cc';

function realityProvider({ questionId = word(7), finalizeTs, calls = [] }) {
    return {
        async send(_method, [{ to, data }]) {
            calls.push({ to, data });
            if (data === '0xb06a5c52') return questionId;
            if (data === `0xacae8f4e${questionId.slice(2)}`) return word(finalizeTs);
            throw new Error('unexpected call');
        },
    };
}

test('resolution-time selectors match the FutarchyProposal / Reality signatures', () => {
    assert.equal(ethers.utils.id('questionId()').slice(0, 10), '0xb06a5c52');
    assert.equal(ethers.utils.id('getFinalizeTS(bytes32)').slice(0, 10), '0xacae8f4e');
});

test('fetchResolutionTime reads the finalize timestamp from the chain\'s Reality contract', async () => {
    const calls = [];
    const seconds = await fetchResolutionTime(RESOLVED_YES, 100, {
        getProvider: () => realityProvider({ finalizeTs: 1790954815, calls }),
    });
    assert.equal(seconds, 1790954815);
    assert.equal(calls[0].to, RESOLVED_YES);
    assert.equal(calls[1].to, REALITY_GNOSIS);
});

test('fetchResolutionTime returns null for unanswered, arbitrated or still-open questions', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    for (const finalizeTs of [0, 1, 2, future]) {
        const seconds = await fetchResolutionTime(RESOLVED_YES, 100, {
            getProvider: () => realityProvider({ finalizeTs }),
        });
        assert.equal(seconds, null, `finalizeTs ${finalizeTs}`);
    }
});

test('fetchResolutionTime returns null on a bad address or a failed read', async () => {
    assert.equal(await fetchResolutionTime('not-an-address', 100, { getProvider: () => realityProvider({ finalizeTs: 5 }) }), null);
    assert.equal(await fetchResolutionTime(RESOLVED_YES, 100, {
        getProvider: () => ({ async send() { throw new Error('rpc down'); } }),
    }), null);
});
