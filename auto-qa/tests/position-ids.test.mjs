/**
 * Position ids (auto-qa).
 *
 * Imports the real src/utils/positionIds.js against a fake provider. The ids
 * must be derived from the proposal on-chain for each market (they used to be
 * four constants in the config, right for one market only), with
 * collateralToken1 as the company token and collateralToken2 as the currency.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fetchPositionIds } from '../../src/utils/positionIds.js';

const { ethers } = createRequire(import.meta.url)('ethers');

const CT = '0x00000000000000000000000000000000000000c7';
const COMPANY = '0x0000000000000000000000000000000000000c01';
const CURRENCY = '0x0000000000000000000000000000000000000c02';
const PARENT = ethers.constants.HashZero;

const IFACE = new ethers.utils.Interface([
    'function conditionId() view returns (bytes32)',
    'function parentCollectionId() view returns (bytes32)',
    'function collateralToken1() view returns (address)',
    'function collateralToken2() view returns (address)',
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function getPositionId(address collateralToken, bytes32 collectionId) pure returns (uint256)',
]);

const conditionFor = (proposal) => ethers.utils.keccak256(proposal);
const collectionFor = (condition, indexSet) => ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [condition, indexSet]);
const positionFor = (collateral, collection) => ethers.BigNumber.from(ethers.utils.solidityKeccak256(['address', 'bytes32'], [collateral, collection]));

function fakeProvider({ failOn = null } = {}) {
    const calls = [];
    return {
        calls,
        async call({ to, data }) {
            const fn = IFACE.getFunction(data.slice(0, 10));
            const args = IFACE.decodeFunctionData(fn, data);
            calls.push({ to, fn: fn.name });
            if (failOn === fn.name) throw new Error('rpc down');
            const encode = (value) => IFACE.encodeFunctionResult(fn, [value]);
            switch (fn.name) {
                case 'conditionId': return encode(conditionFor(to));
                case 'parentCollectionId': return encode(PARENT);
                case 'collateralToken1': return encode(COMPANY);
                case 'collateralToken2': return encode(CURRENCY);
                case 'getCollectionId':
                    assert.equal(to.toLowerCase(), CT);
                    assert.equal(args[0], PARENT);
                    return encode(collectionFor(args[1], args[2]));
                case 'getPositionId': return encode(positionFor(args[0], args[1]));
                default: throw new Error(`unexpected call ${fn.name}`);
            }
        },
    };
}

const expected = (proposal) => {
    const condition = conditionFor(proposal);
    const yes = collectionFor(condition, 1);
    const no = collectionFor(condition, 2);
    return {
        currencyYes: positionFor(CURRENCY, yes).toString(),
        currencyNo: positionFor(CURRENCY, no).toString(),
        companyYes: positionFor(COMPANY, yes).toString(),
        companyNo: positionFor(COMPANY, no).toString(),
    };
};

test('ids are derived from the proposal: YES = index set 1, NO = 2, token1 = company, token2 = currency', async () => {
    const proposal = '0x00000000000000000000000000000000000000a1';
    const ids = await fetchPositionIds({ provider: fakeProvider(), chainId: 100, proposal, conditionalTokens: CT });
    assert.deepEqual(ids, expected(proposal));
    assert.equal(new Set(Object.values(ids)).size, 4);
});

test('two markets get different ids', async () => {
    const a = '0x00000000000000000000000000000000000000b1';
    const b = '0x00000000000000000000000000000000000000b2';
    const provider = fakeProvider();
    const [idsA, idsB] = await Promise.all([a, b].map((proposal) =>
        fetchPositionIds({ provider, chainId: 100, proposal, conditionalTokens: CT })));
    assert.deepEqual(idsA, expected(a));
    assert.deepEqual(idsB, expected(b));
    assert.notDeepEqual(idsA, idsB);
});

test('a market is derived once and then served from the cache', async () => {
    const proposal = '0x00000000000000000000000000000000000000c1';
    const provider = fakeProvider();
    await fetchPositionIds({ provider, chainId: 100, proposal, conditionalTokens: CT });
    const callsAfterFirst = provider.calls.length;
    await fetchPositionIds({ provider, chainId: 100, proposal, conditionalTokens: CT });
    assert.equal(provider.calls.length, callsAfterFirst);
    assert.equal(callsAfterFirst, 10); // 4 proposal reads, 2 collections, 4 positions
});

test('the same proposal address on another chain is derived separately', async () => {
    const proposal = '0x00000000000000000000000000000000000000d1';
    const provider = fakeProvider();
    await fetchPositionIds({ provider, chainId: 100, proposal, conditionalTokens: CT });
    await fetchPositionIds({ provider, chainId: 1, proposal, conditionalTokens: CT });
    assert.equal(provider.calls.length, 20);
});

test('a failed read rejects and is not cached', async () => {
    const proposal = '0x00000000000000000000000000000000000000e1';
    await assert.rejects(
        fetchPositionIds({ provider: fakeProvider({ failOn: 'getCollectionId' }), chainId: 100, proposal, conditionalTokens: CT }),
        /rpc down/
    );
    const ids = await fetchPositionIds({ provider: fakeProvider(), chainId: 100, proposal, conditionalTokens: CT });
    assert.deepEqual(ids, expected(proposal));
});
