/**
 * Transaction outcome helpers (auto-qa).
 *
 * Pins src/utils/txErrors.js and the places that rely on it:
 *   - the Safe "queued" signal is recognised even when a helper wraps it
 *     ("Failed to approve token for X: SAFE_TRANSACTION_SENT")
 *   - reverted receipts (viem 'reverted', ethers 0) throw a CALL_EXCEPTION
 *   - the viem-backed signer's wait() rejects on a reverted transaction
 *     instead of resolving with status 0 (which modals showed as success)
 *   - waitForSafeTxReceipt's failure check: the Safe's outer receipt succeeds
 *     even when the inner call failed
 *   - wallet errors reduce to one short line; rejections to "Transaction cancelled"
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const tx = await import(new URL('../../src/utils/txErrors.js', import.meta.url));
const adapters = await import(new URL('../../src/utils/ethersAdapters.js', import.meta.url));
const safe = await import(new URL('../../src/utils/waitForSafeTxReceipt.js', import.meta.url));

const HASH = '0x' + 'ab'.repeat(32);
const SAFE_TX_HASH = '0x' + 'cd'.repeat(32);

// ---------------------------------------------------------------------------
// SAFE_TRANSACTION_SENT
// ---------------------------------------------------------------------------

test('isSafeTransactionSent — bare signal', () => {
    assert.equal(tx.isSafeTransactionSent(new Error(tx.SAFE_TRANSACTION_SENT)), true);
});

test('isSafeTransactionSent — signal wrapped by a helper is still recognised', () => {
    // sushiswapV3Helper used to rethrow it like this, and the modal showed an
    // error for a transaction the Safe had already queued.
    assert.equal(tx.isSafeTransactionSent(new Error('Failed to approve token for SwapR V3 Router: SAFE_TRANSACTION_SENT')), true);
    assert.equal(tx.isSafeTransactionSent(new Error('Token approval failed: SAFE_TRANSACTION_SENT')), true);
});

test('isSafeTransactionSent — other errors and empty input are not the signal', () => {
    assert.equal(tx.isSafeTransactionSent(new Error('execution reverted')), false);
    assert.equal(tx.isSafeTransactionSent(null), false);
    assert.equal(tx.isSafeTransactionSent({}), false);
});

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

test('isReceiptReverted — viem and ethers shapes', () => {
    assert.equal(tx.isReceiptReverted({ status: 'reverted' }), true);
    assert.equal(tx.isReceiptReverted({ status: 0 }), true);
    assert.equal(tx.isReceiptReverted({ status: 'success' }), false);
    assert.equal(tx.isReceiptReverted({ status: 1 }), false);
    assert.equal(tx.isReceiptReverted(null), false);
});

test('assertReceiptSucceeded — throws an ethers-style CALL_EXCEPTION with the receipt', () => {
    const receipt = { status: 'reverted', transactionHash: HASH };
    assert.throws(() => tx.assertReceiptSucceeded(receipt), (err) => {
        assert.equal(err.code, 'CALL_EXCEPTION');
        assert.equal(err.receipt, receipt);
        assert.equal(err.transactionHash, HASH);
        assert.match(err.message, /reverted/);
        return true;
    });
});

test('assertReceiptSucceeded — passes a successful receipt through', () => {
    const receipt = { status: 'success', transactionHash: HASH };
    assert.equal(tx.assertReceiptSucceeded(receipt), receipt);
});

// ---------------------------------------------------------------------------
// Custom signer wait()
// ---------------------------------------------------------------------------

const fakeClients = (status) => ({
    walletClient: {
        account: { address: '0x0000000000000000000000000000000000000001' },
        chain: { id: 100 },
        sendTransaction: async () => HASH,
    },
    publicClient: {
        chain: { id: 100, name: 'Gnosis' },
        request: async () => '0x64',
        waitForTransactionReceipt: async () => ({ status, transactionHash: HASH, blockNumber: 1n, gasUsed: 21000n, logs: [] }),
    },
});

test('getEthersSigner — wait() rejects on a reverted transaction', async () => {
    const { walletClient, publicClient } = fakeClients('reverted');
    const signer = adapters.getEthersSigner(walletClient, publicClient);
    const sent = await signer.sendTransaction({ to: '0x0000000000000000000000000000000000000002', data: '0x' });
    await assert.rejects(sent.wait(), (err) => {
        assert.equal(err.code, 'CALL_EXCEPTION');
        assert.equal(err.receipt.status, 0);
        assert.equal(err.transactionHash, HASH);
        return true;
    });
});

test('getEthersSigner — wait() resolves with status 1 on success', async () => {
    const { walletClient, publicClient } = fakeClients('success');
    const signer = adapters.getEthersSigner(walletClient, publicClient);
    const sent = await signer.sendTransaction({ to: '0x0000000000000000000000000000000000000002', data: '0x' });
    const receipt = await sent.wait();
    assert.equal(receipt.status, 1);
    assert.equal(receipt.transactionHash, HASH);
});

test('getEthersProvider — reads through the public client, not window.ethereum', async () => {
    const calls = [];
    const publicClient = {
        chain: { id: 100, name: 'Gnosis' },
        request: async ({ method }) => {
            calls.push(method);
            if (method === 'eth_chainId') return '0x64';
            if (method === 'eth_blockNumber') return '0x10';
            throw new Error(`unexpected ${method}`);
        },
    };
    const original = globalThis.window;
    globalThis.window = { ethereum: { request: async () => { throw new Error('window.ethereum must not be used'); } } };
    try {
        const provider = adapters.getEthersProvider(publicClient);
        assert.equal((await provider.getNetwork()).chainId, 100);
        assert.equal(await provider.getBlockNumber(), 16);
        assert.ok(calls.includes('eth_blockNumber'));
    } finally {
        globalThis.window = original;
    }
});

// ---------------------------------------------------------------------------
// Safe execution result
// ---------------------------------------------------------------------------

const executionFailureLog = (safeTxHash) => ({
    topics: [safe.SAFE_EXECUTION_FAILURE_TOPIC],
    data: '0x' + safeTxHash.slice(2) + '0'.repeat(64),
});

test('safeExecutionFailed — outer receipt succeeded but the service says the call failed', () => {
    assert.equal(safe.safeExecutionFailed({
        safeTx: { isSuccessful: false },
        receipt: { status: 'success', logs: [] },
        safeTxHash: SAFE_TX_HASH,
    }), true);
});

test('safeExecutionFailed — ExecutionFailure event for this safeTxHash', () => {
    assert.equal(safe.safeExecutionFailed({
        safeTx: { isSuccessful: null }, // not indexed yet
        receipt: { status: 'success', logs: [executionFailureLog(SAFE_TX_HASH)] },
        safeTxHash: SAFE_TX_HASH,
    }), true);
});

test('safeExecutionFailed — ExecutionFailure for another Safe tx in the block is ignored', () => {
    assert.equal(safe.safeExecutionFailed({
        safeTx: { isSuccessful: null },
        receipt: { status: 'success', logs: [executionFailureLog('0x' + 'ef'.repeat(32))] },
        safeTxHash: SAFE_TX_HASH,
    }), false);
});

test('safeExecutionFailed — reverted outer receipt', () => {
    assert.equal(safe.safeExecutionFailed({ safeTx: {}, receipt: { status: 'reverted', logs: [] }, safeTxHash: SAFE_TX_HASH }), true);
});

test('safeExecutionFailed — successful execution', () => {
    assert.equal(safe.safeExecutionFailed({
        safeTx: { isSuccessful: true },
        receipt: { status: 'success', logs: [{ topics: ['0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e'], data: '0x' }] },
        safeTxHash: SAFE_TX_HASH,
    }), false);
});

test('SAFE_EXECUTION_FAILURE_TOPIC — keccak256("ExecutionFailure(bytes32,uint256)")', async () => {
    const { ethers } = await import('ethers');
    assert.equal(safe.SAFE_EXECUTION_FAILURE_TOPIC, ethers.utils.id('ExecutionFailure(bytes32,uint256)'));
});

// ---------------------------------------------------------------------------
// User rejection / error descriptions
// ---------------------------------------------------------------------------

// The message viem produced in the rejected-signature report: it dragged the
// request arguments and calldata into the modal.
const VIEM_REJECTION_MESSAGE = [
    'User rejected the request.',
    '',
    'Request Arguments:',
    '  from:  0x0000000000000000000000000000000000000001',
    '  to:    0x7495a583ba85875d59407781b4958ED6e0E1228f',
    '  data:  0x7abef8d1' + '0'.repeat(400),
    '',
    'Details: MetaMask Tx Signature: User denied transaction signature.',
    'Version: viem@2.44.4',
].join('\n');

test('isUserRejection — EIP-1193 code 4001, ethers ACTION_REJECTED, viem error name', () => {
    assert.equal(tx.isUserRejection({ code: 4001, message: 'x' }), true);
    assert.equal(tx.isUserRejection({ code: 'ACTION_REJECTED', message: 'x' }), true);
    assert.equal(tx.isUserRejection({ name: 'UserRejectedRequestError', message: 'x' }), true);
});

test('isUserRejection — nested cause (viem wraps the provider error)', () => {
    const err = new Error('The contract function "splitPosition" could not be executed.');
    err.cause = { name: 'TransactionExecutionError', cause: { code: 4001, message: 'User rejected' } };
    assert.equal(tx.isUserRejection(err), true);
});

test('isUserRejection — message only (rewrapped errors lose their code)', () => {
    assert.equal(tx.isUserRejection(new Error(`Token approval failed: ${VIEM_REJECTION_MESSAGE}`)), true);
    assert.equal(tx.isUserRejection(new Error('MetaMask Tx Signature: User denied transaction signature.')), true);
});

test('isUserRejection — ordinary failures are not rejections', () => {
    assert.equal(tx.isUserRejection(new Error('execution reverted: Too little received')), false);
    assert.equal(tx.isUserRejection(new Error('insufficient funds for gas * price + value')), false);
    assert.equal(tx.isUserRejection(null), false);
});

test('describeTxError — rejection becomes "Transaction cancelled"', () => {
    const err = new Error(VIEM_REJECTION_MESSAGE);
    err.shortMessage = 'User rejected the request.';
    assert.equal(tx.describeTxError(err), 'Transaction cancelled');
    assert.equal(tx.describeTxError(new Error(VIEM_REJECTION_MESSAGE)), 'Transaction cancelled');
});

test('describeTxError — prefers viem shortMessage, joining its lines', () => {
    const err = new Error('long\nRequest Arguments:\n data: 0x...');
    err.shortMessage = 'The contract function "exactInputSingle" reverted with the following reason:\nToo little received';
    assert.equal(tx.describeTxError(err), 'The contract function "exactInputSingle" reverted with the following reason: Too little received');
});

test('describeTxError — otherwise only the first line of the message', () => {
    const err = new Error('Insufficient token balance.\n\nRequest Arguments:\n  data: 0xdeadbeef');
    assert.equal(tx.describeTxError(err), 'Insufficient token balance.');
});

test('describeTxError — caps the length and falls back when empty', () => {
    const long = tx.describeTxError(new Error('x'.repeat(500)));
    assert.ok(long.length <= 200, `length ${long.length}`);
    assert.equal(tx.describeTxError(null, 'fallback'), 'fallback');
    assert.equal(tx.describeTxError(new Error(''), 'fallback'), 'fallback');
});
