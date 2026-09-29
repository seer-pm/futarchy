/**
 * balanceReadState spec (auto-qa).
 *
 * Pins src/utils/balanceReadState.js — how the balance fetcher reports a
 * failed read (null + failedReads, never 0) and how useBalanceManager keeps
 * the last known value for a field whose refresh failed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { readOrNull, mergeWithLastKnown, describeFailedReads } = await import(
    new URL('../../src/utils/balanceReadState.js', import.meta.url)
);

const quiet = async (fn) => {
    const log = console.log;
    console.log = () => {};
    try { return await fn(); } finally { console.log = log; }
};

test('readOrNull — a successful read passes through and records nothing', async () => {
    const failed = [];
    const value = await quiet(() => readOrNull(async () => 42n, 'Currency balance', failed));
    assert.equal(value, 42n);
    assert.deepEqual(failed, []);
});

test('readOrNull — a zero balance is a successful read, not a failure', async () => {
    const failed = [];
    const value = await quiet(() => readOrNull(async () => 0n, 'Currency balance', failed));
    assert.equal(value, 0n);
    assert.deepEqual(failed, []);
});

test('readOrNull — a rejected read resolves to null (not 0) and is recorded', async () => {
    const failed = [];
    const value = await quiet(() => readOrNull(async () => { throw new Error('502'); }, 'Currency balance', failed));
    assert.equal(value, null);
    assert.deepEqual(failed, ['Currency balance']);
});

test('readOrNull — an empty result counts as a failed read', async () => {
    const failed = [];
    const value = await quiet(() => readOrNull(async () => undefined, 'ERC1155 position balances', failed));
    assert.equal(value, null);
    assert.deepEqual(failed, ['ERC1155 position balances']);
});

test('mergeWithLastKnown — failed fields keep the previous value', () => {
    const prev = { currency: '10.0', company: '2.0', native: '1.0' };
    const next = { currency: '11.0', company: null, native: null };
    assert.deepEqual(mergeWithLastKnown(prev, next), { currency: '11.0', company: '2.0', native: '1.0' });
});

test('mergeWithLastKnown — a fresh zero replaces the previous value', () => {
    assert.deepEqual(mergeWithLastKnown({ currency: '10.0' }, { currency: '0.0' }), { currency: '0.0' });
});

test('mergeWithLastKnown — no previous value leaves a failed field null (unknown), never 0', () => {
    const merged = mergeWithLastKnown(null, { currency: null, company: '1.0' });
    assert.deepEqual(merged, { currency: null, company: '1.0' });
});

test('describeFailedReads — no failures → null (no error state)', () => {
    assert.equal(describeFailedReads([], 8), null);
    assert.equal(describeFailedReads(undefined, 8), null);
});

test('describeFailedReads — some or all failed → a user-facing message', () => {
    assert.match(describeFailedReads(['Currency balance'], 8), /^1 of 8 balance reads failed/);
    assert.equal(describeFailedReads(Array(8).fill('x'), 8), 'The RPC did not respond.');
});
