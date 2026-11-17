/**
 * On-chain resolution state of futarchy proposals.
 *
 * Registry metadata (resolution_status / resolution_outcome) is written by
 * hand after a market settles and often lags, sometimes for good: Kleros
 * KIP-88 resolved on-chain but its metadata was never updated. The
 * authoritative signal is ConditionalTokens: payoutDenominator > 0 means the
 * condition has been reported and positions can be redeemed.
 *
 * Reads go through the shared per-chain provider (utils/getBestRpc.js), which
 * batches calls issued in the same tick into one POST. Checking a whole list
 * therefore costs two POSTs per chain, however many proposals it holds: one
 * for every conditionId(), one for every payout read.
 */

import { getRpcProvider } from './getBestRpc';

// Gnosis ConditionalTokens on each chain — same addresses as
// adapters/subgraphConfigAdapter.js CHAIN_CONFIG.
export const CONDITIONAL_TOKENS_BY_CHAIN = {
    1: '0xC59b0e4De5F1248C1140964E0fF287B192407E0C',
    100: '0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce',
};

// Function selectors (first four bytes of keccak256 of the signature).
const CONDITION_ID = '0x2ddc7de7';        // conditionId()
const PAYOUT_DENOMINATOR = '0xdd34de67';  // payoutDenominator(bytes32)
const PAYOUT_NUMERATORS = '0x0504c814';   // payoutNumerators(bytes32,uint256)
const NUM_OUTCOMES = '0x8767d64e';        // numOutcomes()
const OUTCOME_SLOT_COUNT = '0xd42dc0c2';  // getOutcomeSlotCount(bytes32)
const OUTCOMES = '0xeed2a147';            // outcomes(uint256)

function normalizeChainId(chainId) {
    return Number(chainId) === 1 ? 1 : 100;
}

export function resolutionKey(chainId, proposalAddress) {
    return `${normalizeChainId(chainId)}:${String(proposalAddress || '').toLowerCase()}`;
}

function isWord(value) {
    return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

async function ethCall(provider, to, data) {
    return provider.send('eth_call', [{ to, data }, 'latest']);
}

const uint256 = (value) => value.toString(16).padStart(64, '0');

// An answer from proposal.outcomes(i): the ABI string (offset word, length
// word, bytes), JSON-unescaped like realityText in utils/proposalOutcomes.js.
function decodeAnswer(hex) {
    const body = String(hex ?? '').slice(2);
    const offset = Number.parseInt(body.slice(0, 64), 16) * 2;
    const length = Number.parseInt(body.slice(offset, offset + 64), 16);
    const bytes = body.slice(offset + 64, offset + 64 + length * 2);
    if (!Number.isInteger(length) || bytes.length !== length * 2) return null;
    const text = new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) || [], (byte) => parseInt(byte, 16)));
    try {
        return JSON.parse(`"${text}"`);
    } catch (_) {
        return text;
    }
}

/**
 * Check many proposals at once.
 *
 * @param {Array<{proposalAddress: string, chainId?: number|string, conditionalTokens?: string}>} proposals
 * @param {{getProvider?: (chainId: number) => {send: Function}}} [options]
 * @returns {Promise<Map<string, {resolved: boolean, outcome: 'yes'|'no'|'invalid'|null, outcomeIndex?: number|null, answer?: string|null}>>}
 *   keyed by resolutionKey(chainId, proposalAddress). For a categorical
 *   proposal (utils/proposalOutcomes.js) a winning answer is outcomeIndex,
 *   with outcome null and answer its name (null when that read failed), and
 *   INVALID is outcome 'invalid'. A proposal whose read failed is absent, so
 *   callers fall back to whatever metadata says.
 */
export async function fetchOnChainResolutions(proposals, { getProvider = getRpcProvider } = {}) {
    const results = new Map();
    const targets = [];
    const seen = new Set();

    for (const proposal of proposals || []) {
        const address = String(proposal?.proposalAddress || '').toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(address) || /^0x0{40}$/.test(address)) continue;
        const chainId = normalizeChainId(proposal.chainId);
        const key = resolutionKey(chainId, address);
        if (seen.has(key)) continue;
        seen.add(key);
        const conditionalTokens = String(
            proposal.conditionalTokens || CONDITIONAL_TOKENS_BY_CHAIN[chainId]
        ).toLowerCase();
        targets.push({ key, chainId, address, conditionalTokens });
    }

    if (targets.length === 0) return results;

    let providers;
    try {
        providers = new Map(
            [...new Set(targets.map((t) => t.chainId))].map((chainId) => [chainId, getProvider(chainId)])
        );
    } catch (error) {
        console.warn('[OnChainResolution] No provider:', error?.message);
        return results;
    }

    // Round 1: conditionId() and numOutcomes() for every proposal — one
    // batched POST per chain.
    const [conditionIds, outcomeCounts] = await Promise.all([
        Promise.all(targets.map((t) =>
            ethCall(providers.get(t.chainId), t.address, CONDITION_ID).catch(() => null)
        )),
        Promise.all(targets.map((t) =>
            ethCall(providers.get(t.chainId), t.address, NUM_OUTCOMES).catch(() => null)
        )),
    ]);

    // Round 2: payout state for every condition — one batched POST per chain.
    // Slot 0 is YES and slot 1 is NO for binary proposals, and the first two
    // answers for categorical ones; reading them alongside the denominator
    // saves another round for most resolved proposals.
    await Promise.all(targets.map(async (t, i) => {
        const conditionId = conditionIds[i];
        if (!isWord(conditionId)) return;
        const word = conditionId.slice(2).toLowerCase();
        const provider = providers.get(t.chainId);
        const numerator = (slot) =>
            ethCall(provider, t.conditionalTokens, `${PAYOUT_NUMERATORS}${word}${uint256(slot)}`);
        try {
            const [denominator, slotCount, yesNumerator, noNumerator] = await Promise.all([
                ethCall(provider, t.conditionalTokens, `${PAYOUT_DENOMINATOR}${word}`),
                // Only categorical proposals need it; a failed read reads as binary.
                ethCall(provider, t.conditionalTokens, `${OUTCOME_SLOT_COUNT}${word}`).catch(() => null),
                numerator(0),
                numerator(1),
            ]);
            if (!isWord(denominator) || !isWord(yesNumerator) || !isWord(noNumerator)) return;
            if (BigInt(denominator) === 0n) {
                results.set(t.key, { resolved: false, outcome: null });
                return;
            }
            // A categorical proposal (FutarchyCategoricalFactory) has one slot
            // per answer plus INVALID last; binary ones have 2 slots and
            // numOutcomes() = 4. Its oracle pays exactly one slot.
            const slots = isWord(slotCount) ? Number(BigInt(slotCount)) : 0;
            const answers = isWord(outcomeCounts[i]) ? Number(BigInt(outcomeCounts[i])) : null;
            if (answers !== null && slots === answers + 1) {
                const paid = [BigInt(yesNumerator) > 0n, BigInt(noNumerator) > 0n];
                if (!paid[0] && !paid[1]) {
                    const rest = await Promise.all(
                        Array.from({ length: slots - 2 }, (_, k) => numerator(k + 2))
                    );
                    if (!rest.every(isWord)) return;
                    paid.push(...rest.map((value) => BigInt(value) > 0n));
                }
                const winner = paid.indexOf(true);
                if (winner === -1) return;
                if (winner === answers) {
                    results.set(t.key, { resolved: true, outcome: 'invalid', outcomeIndex: null });
                    return;
                }
                // Lists and status labels name the winner; without its name
                // the proposal still reads as resolved.
                const answer = await ethCall(provider, t.address, `${OUTCOMES}${uint256(winner)}`)
                    .then(decodeAnswer, () => null);
                results.set(t.key, { resolved: true, outcome: null, outcomeIndex: winner, answer });
                return;
            }
            // Both slots paying out means the question resolved invalid.
            const yesPays = BigInt(yesNumerator) > 0n;
            const noPays = BigInt(noNumerator) > 0n;
            const outcome = yesPays && noPays ? 'invalid' : (yesPays ? 'yes' : (noPays ? 'no' : null));
            results.set(t.key, { resolved: true, outcome });
        } catch (_) {
            // Leave this proposal out; metadata stays authoritative for it.
        }
    }));

    return results;
}

/**
 * Check a single proposal.
 *
 * @param {string} proposalAddress - FutarchyProposal contract address
 * @param {string} conditionalTokensAddress - ConditionalTokens contract address
 * @param {number|string} chainId - Chain the proposal lives on
 * @returns {Promise<{resolved: boolean, outcome: 'Yes'|'No'|'Invalid'|null, answer: string|null}|null>}
 *   null when the check fails; answer names a categorical proposal's winner
 */
export async function fetchOnChainResolution(proposalAddress, conditionalTokensAddress, chainId) {
    const results = await fetchOnChainResolutions([
        { proposalAddress, chainId, conditionalTokens: conditionalTokensAddress },
    ]);
    const result = results.get(resolutionKey(chainId, proposalAddress));
    if (!result) {
        console.warn('[Config] On-chain resolution check failed:', proposalAddress);
        return null;
    }
    return {
        resolved: result.resolved,
        outcome: { yes: 'Yes', no: 'No', invalid: 'Invalid' }[result.outcome] || null,
        answer: result.answer ?? null,
    };
}

// Reality.eth v3 contracts per chain (same as REALITY_CONTRACTS in
// utils/marketPageUtils.mjs).
const REALITY_BY_CHAIN = {
    1: '0x5b7dD1E86623548AF054A4985F7fc8Ccbb554E2c',
    100: '0xE78996A233895bE74a66F451f1019cA9734205cc',
};

const QUESTION_ID = '0xb06a5c52';       // questionId()
const GET_FINALIZE_TS = '0xacae8f4e';   // getFinalizeTS(bytes32)

/**
 * When a proposal's Reality.eth question became final, in Unix seconds.
 *
 * Registry metadata carries no resolution date, so this is the date a
 * resolved market shows. It is the moment the answer could no longer be
 * challenged; the resolve() transaction that reports it can land later.
 *
 * @param {string} proposalAddress - FutarchyProposal contract address
 * @param {number|string} chainId - Chain the proposal lives on
 * @returns {Promise<number|null>} null when unknown, not final yet, or the read fails
 */
export async function fetchResolutionTime(proposalAddress, chainId, { getProvider = getRpcProvider } = {}) {
    const address = String(proposalAddress || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) return null;
    const chain = normalizeChainId(chainId);
    try {
        const provider = getProvider(chain);
        const questionId = await ethCall(provider, address, QUESTION_ID);
        if (!isWord(questionId) || BigInt(questionId) === 0n) return null;
        const finalizeTs = await ethCall(provider, REALITY_BY_CHAIN[chain], `${GET_FINALIZE_TS}${questionId.slice(2)}`);
        if (!isWord(finalizeTs)) return null;
        const seconds = Number(BigInt(finalizeTs));
        // 0 = never answered, 1 = created unanswered, 2 = pending arbitration.
        if (seconds <= 2 || seconds * 1000 > Date.now()) return null;
        return seconds;
    } catch (error) {
        console.warn('[OnChainResolution] Resolution time read failed:', error?.message);
        return null;
    }
}
