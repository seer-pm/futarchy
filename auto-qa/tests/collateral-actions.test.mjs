/**
 * Split and merge of collateral (auto-qa).
 *
 * Imports the real src/utils/collateralActions.js against fake viem clients.
 * The collateral dialog and the trade dialog both call it, so these are the
 * rules for every split and merge in the app: approve only when the allowance
 * is short and only the exact amount unless the user opted in to unlimited,
 * leave gas to the wallet, never report a reverted or Safe-queued transaction
 * as done, and send nothing when the balance is short.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveIfNeeded, splitCollateral, mergeCollateral } from '../../src/utils/collateralActions.js';
import { SAFE_TRANSACTION_SENT } from '../../src/utils/txErrors.js';

const ROUTER = '0x00000000000000000000000000000000000000f1';
const PROPOSAL = '0x00000000000000000000000000000000000000a1';
const ACCOUNT = '0x00000000000000000000000000000000000000ee';
const COLLATERAL = '0x0000000000000000000000000000000000000c01';
const YES = '0x0000000000000000000000000000000000000e51';
const NO = '0x0000000000000000000000000000000000000e52';
const MAX_UINT256 = (1n << 256n) - 1n;

function fakePublicClient({ balances = {}, allowances = {}, receiptStatus = 'success' } = {}) {
    return {
        async readContract({ address, functionName, args }) {
            if (functionName === 'balanceOf') {
                assert.equal(args[0], ACCOUNT);
                return balances[address] ?? 0n;
            }
            if (functionName === 'allowance') {
                assert.deepEqual(args, [ACCOUNT, ROUTER]);
                return allowances[address] ?? 0n;
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
        async getChainId() { return 100; },
        async writeContract(request) {
            writes.push(request);
            return `0xhash${writes.length}`;
        },
    };
}

const splitArgs = (overrides = {}) => ({
    account: ACCOUNT, router: ROUTER, proposal: PROPOSAL, collateralToken: COLLATERAL, amount: 500n, symbol: 'sDAI',
    ...overrides,
});
const mergeArgs = (overrides = {}) => ({ ...splitArgs(), yesToken: YES, noToken: NO, ...overrides });
const NO_GAS_FIELDS = ['gas', 'gasLimit', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas'];

test('split — approves the exact amount, then splits, with no gas fields', async () => {
    const publicClient = fakePublicClient({ balances: { [COLLATERAL]: 500n } });
    const walletClient = fakeWalletClient();
    const steps = [];

    const { hash, receipt } = await splitCollateral(splitArgs({ publicClient, walletClient, onStep: (s) => steps.push(s) }));

    assert.deepEqual(walletClient.writes.map((w) => [w.address, w.functionName, w.args]), [
        [COLLATERAL, 'approve', [ROUTER, 500n]],
        [ROUTER, 'splitPosition', [PROPOSAL, COLLATERAL, 500n]],
    ]);
    for (const write of walletClient.writes) {
        assert.equal(write.account, ACCOUNT);
        for (const field of NO_GAS_FIELDS) assert.equal(field in write, false, field);
    }
    assert.equal(hash, '0xhash2');
    assert.equal(receipt.status, 'success');
    assert.deepEqual(steps, ['approval', 'approved', 'split', 'done']);
});

test('split — skips the approval when the allowance already covers it, and still reports the step', async () => {
    const publicClient = fakePublicClient({ balances: { [COLLATERAL]: 500n }, allowances: { [COLLATERAL]: 500n } });
    const walletClient = fakeWalletClient();
    const steps = [];

    await splitCollateral(splitArgs({ publicClient, walletClient, onStep: (s) => steps.push(s) }));

    assert.deepEqual(walletClient.writes.map((w) => w.functionName), ['splitPosition']);
    assert.deepEqual(steps, ['approval', 'approved', 'split', 'done']);
});

test('split — an amount given as a string is sent as the same raw amount', async () => {
    const publicClient = fakePublicClient({ balances: { [COLLATERAL]: 10n ** 18n } });
    const walletClient = fakeWalletClient();

    await splitCollateral(splitArgs({ publicClient, walletClient, amount: '1000000000000000000' }));

    assert.deepEqual(walletClient.writes[0].args, [ROUTER, 10n ** 18n]);
    assert.deepEqual(walletClient.writes[1].args, [PROPOSAL, COLLATERAL, 10n ** 18n]);
});

test('split — unlimited approval only when the user opted in', async () => {
    const publicClient = fakePublicClient({ balances: { [COLLATERAL]: 500n } });
    const walletClient = fakeWalletClient();

    await splitCollateral(splitArgs({ publicClient, walletClient, useUnlimitedApproval: true }));

    assert.deepEqual(walletClient.writes[0].args, [ROUTER, MAX_UINT256]);
    assert.deepEqual(walletClient.writes[1].args, [PROPOSAL, COLLATERAL, 500n]);
});

test('split — a short balance sends nothing', async () => {
    const publicClient = fakePublicClient({ balances: { [COLLATERAL]: 499n } });
    const walletClient = fakeWalletClient();

    await assert.rejects(splitCollateral(splitArgs({ publicClient, walletClient })), /Insufficient sDAI balance/);
    assert.equal(walletClient.writes.length, 0);
});

test('split — a reverted approval stops before the split', async () => {
    const publicClient = fakePublicClient({ balances: { [COLLATERAL]: 500n }, receiptStatus: 'reverted' });
    const walletClient = fakeWalletClient();
    const steps = [];

    await assert.rejects(splitCollateral(splitArgs({ publicClient, walletClient, onStep: (s) => steps.push(s) })));
    assert.deepEqual(walletClient.writes.map((w) => w.functionName), ['approve']);
    assert.deepEqual(steps, ['approval']);
});

test('split — a reverted split is an error, not "done"', async () => {
    const publicClient = fakePublicClient({
        balances: { [COLLATERAL]: 500n }, allowances: { [COLLATERAL]: 500n }, receiptStatus: 'reverted',
    });
    const steps = [];

    await assert.rejects(splitCollateral(splitArgs({ publicClient, walletClient: fakeWalletClient(), onStep: (s) => steps.push(s) })));
    assert.equal(steps.includes('done'), false);
});

test('split — a Safe queues the first transaction and stops with the Safe signal', async () => {
    const publicClient = fakePublicClient({ balances: { [COLLATERAL]: 500n } });
    publicClient.waitForTransactionReceipt = () => { throw new Error('a safeTxHash is not an on-chain hash'); };
    const walletClient = fakeWalletClient();
    const steps = [];

    await assert.rejects(
        splitCollateral(splitArgs({ publicClient, walletClient, isSafe: true, onStep: (s) => steps.push(s) })),
        (error) => error.message === SAFE_TRANSACTION_SENT,
    );
    assert.deepEqual(walletClient.writes.map((w) => w.functionName), ['approve']);
    assert.deepEqual(steps, ['approval']);
});

test('split — a Safe with the allowance in place queues the split itself', async () => {
    const publicClient = fakePublicClient({ balances: { [COLLATERAL]: 500n }, allowances: { [COLLATERAL]: 500n } });
    const walletClient = fakeWalletClient();
    const steps = [];

    await assert.rejects(
        splitCollateral(splitArgs({ publicClient, walletClient, isSafe: true, onStep: (s) => steps.push(s) })),
        (error) => error.message === SAFE_TRANSACTION_SENT,
    );
    assert.deepEqual(walletClient.writes.map((w) => w.functionName), ['splitPosition']);
    assert.equal(steps.includes('done'), false);
});

test('merge — approves YES then NO for the exact amount, then merges into the collateral token', async () => {
    const publicClient = fakePublicClient({ balances: { [YES]: 700n, [NO]: 500n } });
    const walletClient = fakeWalletClient();
    const steps = [];

    const { hash } = await mergeCollateral(mergeArgs({ publicClient, walletClient, onStep: (s) => steps.push(s) }));

    assert.deepEqual(walletClient.writes.map((w) => [w.address, w.functionName, w.args]), [
        [YES, 'approve', [ROUTER, 500n]],
        [NO, 'approve', [ROUTER, 500n]],
        [ROUTER, 'mergePositions', [PROPOSAL, COLLATERAL, 500n]],
    ]);
    for (const write of walletClient.writes) {
        for (const field of NO_GAS_FIELDS) assert.equal(field in write, false, field);
    }
    assert.equal(hash, '0xhash3');
    assert.deepEqual(steps, ['yesApproval', 'yesApproved', 'noApproval', 'noApproved', 'merge', 'done']);
});

test('merge — only the token whose allowance is short is approved', async () => {
    const publicClient = fakePublicClient({ balances: { [YES]: 500n, [NO]: 500n }, allowances: { [YES]: 500n, [NO]: 499n } });
    const walletClient = fakeWalletClient();

    await mergeCollateral(mergeArgs({ publicClient, walletClient }));

    assert.deepEqual(walletClient.writes.map((w) => [w.address, w.functionName]), [
        [NO, 'approve'],
        [ROUTER, 'mergePositions'],
    ]);
});

test('merge — needs the amount of both tokens; otherwise nothing is sent', async () => {
    for (const balances of [{ [YES]: 500n, [NO]: 499n }, { [YES]: 499n, [NO]: 500n }]) {
        const walletClient = fakeWalletClient();
        await assert.rejects(
            mergeCollateral(mergeArgs({ publicClient: fakePublicClient({ balances }), walletClient })),
            /Insufficient token balance/,
        );
        assert.equal(walletClient.writes.length, 0);
    }
});

test('merge — a reverted merge is an error', async () => {
    const publicClient = fakePublicClient({
        balances: { [YES]: 500n, [NO]: 500n }, allowances: { [YES]: 500n, [NO]: 500n }, receiptStatus: 'reverted',
    });
    await assert.rejects(mergeCollateral(mergeArgs({ publicClient, walletClient: fakeWalletClient() })));
});

test('approveIfNeeded — reports whether an approval was sent', async () => {
    const args = { account: ACCOUNT, token: COLLATERAL, spender: ROUTER, amount: 500n };

    const short = fakeWalletClient();
    assert.equal(await approveIfNeeded({ ...args, publicClient: fakePublicClient(), walletClient: short }), true);
    assert.equal(short.writes.length, 1);

    const enough = fakeWalletClient();
    assert.equal(
        await approveIfNeeded({ ...args, publicClient: fakePublicClient({ allowances: { [COLLATERAL]: 501n } }), walletClient: enough }),
        false,
    );
    assert.equal(enough.writes.length, 0);
});
