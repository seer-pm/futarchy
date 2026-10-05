/**
 * Unwrapped winning positions (auto-qa).
 *
 * Imports the real src/utils/unwrappedWinnings.js against fake viem clients:
 * position ids must come from the proposal on-chain (the config's ids are the
 * same constants for every market), only the winning index set is redeemed,
 * and a reverted or Safe-queued transaction is not reported as done.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUnwrappedWinnings, redeemUnwrappedWinnings } from '../../src/utils/unwrappedWinnings.js';

const PROPOSAL = '0x00000000000000000000000000000000000000a1';
const CT = '0x00000000000000000000000000000000000000c7';
const ACCOUNT = '0x00000000000000000000000000000000000000ee';
const COMPANY = '0x0000000000000000000000000000000000000c01';
const CURRENCY = '0x0000000000000000000000000000000000000c02';
const ZERO = `0x${'0'.repeat(64)}`;
const CONDITION = `0x${'11'.repeat(32)}`;
const collectionFor = (indexSet) => `0x${String(indexSet).repeat(64)}`;

function fakePublicClient({ parent = ZERO, balances = {}, receiptStatus = 'success' } = {}) {
    const calls = [];
    return {
        calls,
        async readContract({ address, functionName, args }) {
            calls.push({ address, functionName, args });
            if (address === PROPOSAL) {
                return { conditionId: CONDITION, parentCollectionId: parent, collateralToken1: COMPANY, collateralToken2: CURRENCY }[functionName];
            }
            assert.equal(address, CT);
            if (functionName === 'getCollectionId') {
                assert.deepEqual(args.slice(0, 2), [parent, CONDITION]);
                return collectionFor(args[2]);
            }
            if (functionName === 'getPositionId') return BigInt(args[0]) * 1000n + BigInt(args[1].slice(-1));
            if (functionName === 'balanceOf') {
                assert.equal(args[0], ACCOUNT);
                return balances[args[1]] ?? 0n;
            }
            throw new Error(`unexpected read ${functionName}`);
        },
        async waitForTransactionReceipt({ hash }) {
            return { status: receiptStatus, transactionHash: hash };
        },
    };
}

function fakeWalletClient() {
    const writes = [];
    return {
        writes,
        chain: { id: 100 },
        async writeContract(request) {
            writes.push(request);
            return `0xhash${writes.length}`;
        },
    };
}

const idFor = (collateral, indexSet) => BigInt(collateral) * 1000n + BigInt(indexSet);

test('fetchUnwrappedWinnings derives the winning position ids from the proposal', async () => {
    const publicClient = fakePublicClient({ balances: { [idFor(CURRENCY, 1)]: 5n } });
    const winnings = await fetchUnwrappedWinnings({ publicClient, proposal: PROPOSAL, conditionalTokens: CT, account: ACCOUNT, side: 'yes' });

    assert.equal(winnings.conditionId, CONDITION);
    assert.equal(winnings.indexSet, 1n);
    assert.equal(winnings.redeemable, true);
    assert.deepEqual(winnings.positions, [
        { role: 'company', collateral: COMPANY, positionId: idFor(COMPANY, 1), balance: 0n },
        { role: 'currency', collateral: CURRENCY, positionId: idFor(CURRENCY, 1), balance: 5n },
    ]);
});

test('fetchUnwrappedWinnings uses index set 2 when NO wins and rejects other outcomes', async () => {
    const publicClient = fakePublicClient({ balances: { [idFor(COMPANY, 2)]: 7n } });
    const winnings = await fetchUnwrappedWinnings({ publicClient, proposal: PROPOSAL, conditionalTokens: CT, account: ACCOUNT, side: 'no' });
    assert.equal(winnings.indexSet, 2n);
    assert.equal(winnings.positions[0].balance, 7n);

    await assert.rejects(
        fetchUnwrappedWinnings({ publicClient, proposal: PROPOSAL, conditionalTokens: CT, account: ACCOUNT, side: null }),
        /No winning side/
    );
});

test('a nested market is reported as not redeemable and is never sent', async () => {
    const parent = `0x${'ab'.repeat(32)}`;
    const publicClient = fakePublicClient({ parent, balances: { [idFor(CURRENCY, 1)]: 5n } });
    const winnings = await fetchUnwrappedWinnings({ publicClient, proposal: PROPOSAL, conditionalTokens: CT, account: ACCOUNT, side: 'yes' });
    assert.equal(winnings.redeemable, false);

    const walletClient = fakeWalletClient();
    await assert.rejects(
        redeemUnwrappedWinnings({ publicClient, walletClient, conditionalTokens: CT, account: ACCOUNT, winnings }),
        /nested market/
    );
    assert.equal(walletClient.writes.length, 0);
});

test('redeemUnwrappedWinnings sends one redeemPositions per collateral with a balance', async () => {
    const publicClient = fakePublicClient({ balances: { [idFor(COMPANY, 1)]: 3n, [idFor(CURRENCY, 1)]: 5n } });
    const winnings = await fetchUnwrappedWinnings({ publicClient, proposal: PROPOSAL, conditionalTokens: CT, account: ACCOUNT, side: 'yes' });
    const walletClient = fakeWalletClient();

    const hashes = await redeemUnwrappedWinnings({ publicClient, walletClient, conditionalTokens: CT, account: ACCOUNT, winnings });

    assert.deepEqual(hashes, ['0xhash1', '0xhash2']);
    assert.deepEqual(walletClient.writes.map((w) => [w.address, w.functionName, w.args]), [
        [CT, 'redeemPositions', [COMPANY, ZERO, CONDITION, [1n]]],
        [CT, 'redeemPositions', [CURRENCY, ZERO, CONDITION, [1n]]],
    ]);
});

test('redeemUnwrappedWinnings skips empty positions', async () => {
    const publicClient = fakePublicClient({ balances: { [idFor(CURRENCY, 1)]: 5n } });
    const winnings = await fetchUnwrappedWinnings({ publicClient, proposal: PROPOSAL, conditionalTokens: CT, account: ACCOUNT, side: 'yes' });
    const walletClient = fakeWalletClient();
    await redeemUnwrappedWinnings({ publicClient, walletClient, conditionalTokens: CT, account: ACCOUNT, winnings });
    assert.equal(walletClient.writes.length, 1);
    assert.equal(walletClient.writes[0].args[0], CURRENCY);
});

test('a reverted redeem throws instead of reporting success', async () => {
    const publicClient = fakePublicClient({ balances: { [idFor(CURRENCY, 1)]: 5n }, receiptStatus: 'reverted' });
    const winnings = await fetchUnwrappedWinnings({ publicClient, proposal: PROPOSAL, conditionalTokens: CT, account: ACCOUNT, side: 'yes' });
    await assert.rejects(
        redeemUnwrappedWinnings({ publicClient, walletClient: fakeWalletClient(), conditionalTokens: CT, account: ACCOUNT, winnings }),
        /reverted/
    );
});

test('a Safe gets the queued signal after its first transaction', async () => {
    const publicClient = fakePublicClient({ balances: { [idFor(COMPANY, 1)]: 3n, [idFor(CURRENCY, 1)]: 5n } });
    const winnings = await fetchUnwrappedWinnings({ publicClient, proposal: PROPOSAL, conditionalTokens: CT, account: ACCOUNT, side: 'yes' });
    const walletClient = fakeWalletClient();
    await assert.rejects(
        redeemUnwrappedWinnings({ publicClient, walletClient, conditionalTokens: CT, account: ACCOUNT, winnings, isSafe: true }),
        /SAFE_TRANSACTION_SENT/
    );
    assert.equal(walletClient.writes.length, 1);
});
