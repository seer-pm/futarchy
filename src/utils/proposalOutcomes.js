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

// AMM factory each chain's futarchy pools are created on: Swapr (Algebra) on
// Gnosis, Uniswap V3 on Ethereum at the 1% tier, as in
// adapters/subgraphConfigAdapter.js fetchProposalFromChain.
const AMM_BY_CHAIN = {
    1: { factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', fee: 10000 },
    100: { factory: '0xA0864cCA6E114013AB0e27cbd5B6f4c8947da766' },
};
const AMM_ABI = parseAbi([
    'function poolByPair(address, address) view returns (address)',
    'function getPool(address, address, uint24) view returns (address)',
    'function token0() view returns (address)',
    'function liquidity() view returns (uint128)',
    'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint16 communityFeeToken0, uint16 communityFeeToken1, bool unlocked)',
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
]);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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
 * An answer as people read it. Creation tools JSON-escape answers
 * (utils/categoricalProposal.mjs), because Reality inserts them into a JSON
 * template; text that is not a valid JSON string body is shown as stored.
 * @param {string} text proposal.outcomes(i)
 */
export function realityText(text) {
    try {
        return JSON.parse(`"${text}"`);
    } catch (_) {
        return text;
    }
}

/**
 * Reasons a categorical proposal may not mean what its outcomes say. The
 * factory takes outcome and token names as given (like Seer's markets), so a
 * creator can build a proposal whose Reality question lists other answers
 * than its slots, or whose tokens share a name. The UI shows a warning.
 *
 * @param {object} p
 * @param {string} p.encodedQuestion proposal.encodedQuestion()
 * @param {string[]} p.outcomes realityText(proposal.outcomes(i)) for each answer
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
            ? Promise.all(Array.from({ length: answers }, (_, i) => call('outcomes', [BigInt(i)]).then(realityText)))
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
 * Price of `base` in units of the pool's other token, from the pool's sqrt
 * price, for two 18-decimal tokens (outcome tokens and the futarchy
 * collaterals). The pool price is token1 per token0.
 * @param {bigint} sqrtPriceX96
 * @returns {number|null} null for an uninitialized pool
 */
export function poolPrice(sqrtPriceX96, token0, base) {
    if (!sqrtPriceX96) return null;
    const ratio = Number(sqrtPriceX96) / 2 ** 96;
    const price = ratio * ratio;
    return token0.toLowerCase() === base.toLowerCase() ? price : 1 / price;
}

/**
 * The pools of each answer of a categorical proposal, read from the AMM
 * factory (the candles indexer only knows binary proposals):
 *   - conditional: answer's company token / answer's currency token, whose
 *     price is the company token's price if that answer wins;
 *   - prediction: answer's currency token / currency token, whose price is
 *     the chance the market gives that answer.
 * INVALID has no pools. A pool is null when nobody created it.
 *
 * @returns {Promise<Array<{key: string, label: string, company: object, currency: object,
 *   conditional: {address: string, price: number|null, liquidity: bigint}|null,
 *   prediction: {address: string, price: number|null, liquidity: bigint}|null}>>}
 *   price is the company token in currency tokens (conditional) or the
 *   answer's currency token in currency tokens (prediction)
 */
export async function fetchOutcomePools(proposal, provider, { chainId = 100 } = {}) {
    const amm = AMM_BY_CHAIN[Number(chainId) === 1 ? 1 : 100];
    const findPool = ([tokenA, tokenB]) => (amm.fee
        ? read(provider, amm.factory, AMM_ABI, 'getPool', [tokenA, tokenB, amm.fee])
        : read(provider, amm.factory, AMM_ABI, 'poolByPair', [tokenA, tokenB]));
    const readPool = async (address, base) => {
        if (address === ZERO_ADDRESS) return null;
        const [token0, liquidity, state] = await Promise.all([
            read(provider, address, AMM_ABI, 'token0'),
            read(provider, address, AMM_ABI, 'liquidity'),
            read(provider, address, AMM_ABI, amm.fee ? 'slot0' : 'globalState'),
        ]);
        return { address, price: poolPrice(state[0], token0, base), liquidity };
    };

    const answers = outcomeRows(proposal).filter((row) => !row.isInvalid);
    const pairs = answers.flatMap((row) => [
        [row.company.address, row.currency.address],
        [row.currency.address, proposal.currencyToken],
    ]);
    const addresses = await Promise.all(pairs.map(findPool));
    const pools = await Promise.all(addresses.map((address, i) => readPool(address, pairs[i][0])));
    return answers.map((row, i) => ({ ...row, conditional: pools[2 * i], prediction: pools[2 * i + 1] }));
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
