/**
 * Outcomes and outcome tokens of a futarchy proposal, read from the chain.
 *
 * Two kinds of proposal share FutarchyProposal (seer-pm/demo contracts):
 *
 *   - binary: FutarchyFactory. A Yes/No question with 2 condition slots; a
 *     Reality Invalid answer pays No. numOutcomes() returns 4 (Yes-PNK, No-PNK,
 *     Yes-sDAI, No-sDAI) and wrappedOutcome is [YES_c1, NO_c1, YES_c2, NO_c2].
 *   - categorical: FutarchyCategoricalFactory. N answers plus INVALID, so N + 1
 *     condition slots, numOutcomes() returns N, and wrappedOutcome is
 *     [answers of c1, answers of c2, INVALID_c1, INVALID_c2].
 *
 * A proposal is categorical when its condition has numOutcomes() + 1 slots.
 * In both kinds answer i of collateral1 is wrappedOutcome(i) and of
 * collateral2 is wrappedOutcome(i + answers), so one layout covers both.
 *
 * Reads go through a provider with send('eth_call', ...), such as the shared
 * batching provider from utils/getBestRpc.js: calls issued in the same tick
 * share one POST, so a proposal costs three POSTs whatever its N.
 */

import { decodeFunctionResult, encodeFunctionData, hexToString, parseAbi, sliceHex } from 'viem';

const PROPOSAL_ABI = parseAbi([
    'function conditionId() view returns (bytes32)',
    'function numOutcomes() view returns (uint256)',
    'function outcomes(uint256) view returns (string)',
    'function wrappedOutcome(uint256) view returns (address, bytes)',
    'function collateralToken1() view returns (address)',
    'function collateralToken2() view returns (address)',
    'function encodedQuestion() view returns (string)',
]);
const CONDITIONAL_TOKENS_ABI = parseAbi(['function getOutcomeSlotCount(bytes32) view returns (uint256)']);
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

// Same as utils/onChainResolution.js CONDITIONAL_TOKENS_BY_CHAIN.
const CONDITIONAL_TOKENS_BY_CHAIN = {
    1: '0xC59b0e4De5F1248C1140964E0fF287B192407E0C',
    100: '0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce',
};

// FutarchyCategoricalRouter per chain: categorical proposals split, merge and
// redeem through it, binary ones through FutarchyRouter. Not deployed yet; the
// variables set one for a build.
export const CATEGORICAL_ROUTER_BY_CHAIN = {
    1: process.env.NEXT_PUBLIC_MAINNET_FUTARCHY_CATEGORICAL_ROUTER || null,
    100: process.env.NEXT_PUBLIC_GNOSIS_FUTARCHY_CATEGORICAL_ROUTER || null,
};

// Reality.eth separator between question, outcomes, category and language.
const REALITY_SEPARATOR = '\u241f';

async function read(provider, address, abi, functionName, args = []) {
    const data = await provider.send('eth_call', [
        { to: address, data: encodeFunctionData({ abi, functionName, args }) },
        'latest',
    ]);
    return decodeFunctionResult({ abi, functionName, data });
}

/**
 * Name of a Wrapped1155 token from the data FutarchyFactory and
 * FutarchyCategoricalFactory wrap it with: toString31(name) first, which
 * holds the name left-aligned and its byte length times two in the last byte.
 * @param {string} data hex bytes from wrappedOutcome
 * @returns {string|null}
 */
export function wrappedTokenName(data) {
    if (typeof data !== 'string' || data.length < 66) return null;
    const word = sliceHex(data, 0, 32);
    const length = parseInt(word.slice(-2), 16) / 2;
    if (!Number.isInteger(length) || length > 31) return null;
    return length === 0 ? '' : hexToString(sliceHex(word, 0, length));
}

/**
 * Reasons a categorical proposal may not mean what its outcomes say. The
 * factory takes outcome and token names as given (like Seer's markets), so a
 * creator can build a proposal whose Reality question lists other answers
 * than its slots, or whose tokens share a name. The UI shows a warning.
 *
 * @param {object} p
 * @param {string} p.encodedQuestion proposal.encodedQuestion()
 * @param {string[]} p.outcomes proposal.outcomes(i) for each answer
 * @param {string[]} p.tokenNames names of every wrapped token
 * @returns {Array<{code: 'question-mismatch'|'duplicate-token-names', message: string}>}
 */
export function categoricalWarnings({ encodedQuestion, outcomes, tokenNames }) {
    const warnings = [];

    // Reality reads the second field as the JSON list of answers.
    const fields = String(encodedQuestion ?? '').split(REALITY_SEPARATOR);
    let questionOutcomes = null;
    if (fields.length === 4) {
        try {
            questionOutcomes = JSON.parse(`[${fields[1]}]`);
        } catch (_) {
            questionOutcomes = null;
        }
    }
    const matches = Array.isArray(questionOutcomes)
        && questionOutcomes.length === outcomes.length
        && questionOutcomes.every((answer, i) => answer === outcomes[i]);
    if (!matches) {
        warnings.push({
            code: 'question-mismatch',
            message: 'The answers of the Reality question do not match this market\'s outcomes. '
                + 'The winning token may not be the one its name suggests.',
        });
    }

    const names = tokenNames.map((name) => String(name ?? '').toUpperCase());
    if (new Set(names).size !== names.length) {
        warnings.push({
            code: 'duplicate-token-names',
            message: 'Two outcome tokens of this market have the same name.',
        });
    }

    return warnings;
}

/**
 * The outcomes of a proposal and their tokens.
 *
 * @param {string} proposalAddress
 * @param {{send: Function}} provider
 * @param {{chainId?: number, conditionalTokens?: string}} [options]
 * @returns {Promise<{
 *   kind: 'binary'|'categorical',
 *   conditionId: string,
 *   companyToken: string,
 *   currencyToken: string,
 *   outcomes: Array<{label: string, company: {address: string, name: string|null}, currency: {address: string, name: string|null}}>,
 *   invalid: {company: {address: string, name: string|null}, currency: {address: string, name: string|null}}|null,
 *   warnings: Array<{code: string, message: string}>,
 * }>} outcomes are in slot order; invalid is null for binary proposals,
 *   where an Invalid answer pays No.
 */
export async function fetchProposalOutcomes(proposalAddress, provider, { chainId = 100, conditionalTokens } = {}) {
    const ctf = conditionalTokens || CONDITIONAL_TOKENS_BY_CHAIN[Number(chainId) === 1 ? 1 : 100];
    const call = (functionName, args) => read(provider, proposalAddress, PROPOSAL_ABI, functionName, args);

    const [conditionId, numOutcomes, companyToken, currencyToken] = await Promise.all([
        call('conditionId'),
        call('numOutcomes'),
        call('collateralToken1'),
        call('collateralToken2'),
    ]);
    const slotCount = Number(await read(provider, ctf, CONDITIONAL_TOKENS_ABI, 'getOutcomeSlotCount', [conditionId]));
    const kind = slotCount === Number(numOutcomes) + 1 ? 'categorical' : 'binary';
    if (kind === 'binary' && slotCount !== 2) {
        throw new Error(`Unexpected futarchy proposal layout: ${slotCount} slots, ${numOutcomes} outcomes`);
    }

    const answers = slotCount - (kind === 'categorical' ? 1 : 0);
    const tokenCount = kind === 'categorical' ? 2 * answers + 2 : 4;
    const [wrapped, labels, encodedQuestion] = await Promise.all([
        Promise.all(Array.from({ length: tokenCount }, (_, i) => call('wrappedOutcome', [BigInt(i)]))),
        kind === 'categorical'
            ? Promise.all(Array.from({ length: answers }, (_, i) => call('outcomes', [BigInt(i)])))
            : ['Yes', 'No'],
        kind === 'categorical' ? call('encodedQuestion') : null,
    ]);

    const token = (index) => ({ address: wrapped[index][0], name: wrappedTokenName(wrapped[index][1]) });
    const outcomes = labels.map((label, i) => ({ label, company: token(i), currency: token(i + answers) }));
    const invalid = kind === 'categorical'
        ? { company: token(2 * answers), currency: token(2 * answers + 1) }
        : null;

    return {
        kind,
        conditionId,
        companyToken,
        currencyToken,
        outcomes,
        invalid,
        warnings: kind === 'categorical'
            ? categoricalWarnings({
                encodedQuestion,
                outcomes: labels,
                tokenNames: wrapped.map(([, data]) => wrappedTokenName(data)),
            })
            : [],
    };
}

/**
 * The outcome slots of a proposal from fetchProposalOutcomes, in slot order:
 * the answers, then INVALID for a categorical proposal.
 * @returns {Array<{key: string, label: string, isInvalid: boolean, company: {address: string, name: string|null}, currency: {address: string, name: string|null}}>}
 */
export function outcomeRows(proposal) {
    const rows = proposal.outcomes.map((outcome, index) => ({ key: String(index), isInvalid: false, ...outcome }));
    if (proposal.invalid) rows.push({ key: 'invalid', label: 'Invalid', isInvalid: true, ...proposal.invalid });
    return rows;
}

/**
 * The slot a resolved categorical proposal pays, from its
 * fetchOnChainResolutions result: the winning answer, or INVALID.
 * @returns {ReturnType<typeof outcomeRows>[number]|null} null while unresolved
 */
export function winningRow(proposal, resolution) {
    if (proposal?.kind !== 'categorical' || !resolution?.resolved) return null;
    const rows = outcomeRows(proposal);
    if (resolution.outcome === 'invalid') return rows[rows.length - 1];
    return Number.isInteger(resolution.outcomeIndex) && resolution.outcomeIndex < proposal.outcomes.length
        ? rows[resolution.outcomeIndex]
        : null;
}

/**
 * Balances of an account in both collaterals and every outcome token of a
 * proposal, in one batched round.
 * @returns {Promise<Map<string, bigint>>} keyed by lowercase token address
 */
export async function fetchOutcomeBalances(proposal, account, provider) {
    const tokens = [
        proposal.companyToken,
        proposal.currencyToken,
        ...outcomeRows(proposal).flatMap((row) => [row.company.address, row.currency.address]),
    ];
    const values = await Promise.all(tokens.map((token) => read(provider, token, ERC20_ABI, 'balanceOf', [account])));
    return new Map(tokens.map((token, i) => [token.toLowerCase(), values[i]]));
}

/**
 * How much of a collateral the account can get back by merging: merging takes
 * the same amount of every outcome token of that collateral, INVALID included.
 * @param {'company'|'currency'} side
 */
export function mergeableAmount(proposal, balances, side) {
    return outcomeRows(proposal)
        .map((row) => balances.get(row[side].address.toLowerCase()) ?? 0n)
        .reduce((min, balance) => (balance < min ? balance : min));
}
