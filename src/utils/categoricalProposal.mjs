/**
 * Arguments of FutarchyCategoricalFactory.createProposal (seer-pm/demo), for
 * every tool that creates proposals: the Create Proposal modal
 * (components/debug) and the swapr CLI (swapr/algebra-cli.js), which imports
 * this file. A categorical proposal asks a question with N answers plus
 * INVALID; Yes/No questions keep using FutarchyFactory.
 *
 * The factory takes names as given, so the checks live here:
 *   - answers are JSON-escaped, as Seer's create-market does: Reality inserts
 *     them into a JSON template, so an unescaped quote splits one answer into
 *     two and moves the slots off the answers they name;
 *   - the question is stored as written, because this app shows marketName
 *     as is (Yes/No proposals do the same), so it may not hold what the JSON
 *     template or the Reality field separator would misread;
 *   - token names become `<NAME>_<collateral symbol>`, which the factory packs
 *     into 31 bytes and reverts on when longer;
 *   - gas grows with N, about 2.6M at 2 answers plus 0.65M per answer (Gnosis
 *     fork measurements), against a 17M block.
 * utils/proposalOutcomes.js reads the escaped names back.
 */

export const CATEGORICAL_FACTORY_ABI = [
    'function createProposal((string,string[],string[],address,address,string,string,uint256,uint32)) returns (address)',
    'function proposals(uint256) view returns (address)',
    'function marketsCount() view returns (uint256)',
];

// 20 answers estimate 14.3M gas, the most that leaves room in a 17M block.
export const MAX_CATEGORICAL_OUTCOMES = 20;

// FutarchyCategoricalFactory.toString31 requires names shorter than 32 bytes.
const MAX_TOKEN_NAME_BYTES = 31;

// Reality.eth separates question, answers, category and language with it.
const REALITY_SEPARATOR = '\u241f';

const byteLength = (text) => new TextEncoder().encode(text).length;

/** Text as it goes inside a JSON string, like Seer's escapeJson. */
export function escapeRealityText(text) {
    return JSON.stringify(String(text)).slice(1, -1);
}

/** Token name prefix for an answer: "Javier Milei" becomes "JAVIER_MILEI". */
export function defaultTokenName(answer) {
    return String(answer ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/** Gas a categorical proposal with `count` answers needs, roughly. */
export function estimateCategoricalGas(count) {
    return 2_600_000 + 650_000 * Math.max(0, count - 2);
}

/**
 * Check a categorical proposal and build the createProposal tuple.
 *
 * @param {object} input
 * @param {string} input.marketName the question
 * @param {string[]} input.outcomes the answers, in slot order
 * @param {string[]} [input.tokenNames] token name prefix per answer; a blank
 *   one defaults to defaultTokenName(answer)
 * @param {string} input.companyToken collateralToken1
 * @param {string} input.currencyToken collateralToken2
 * @param {string} [input.companySymbol] symbol() of companyToken, to check token name lengths
 * @param {string} [input.currencySymbol] symbol() of currencyToken
 * @param {string} input.category
 * @param {string} input.language
 * @param {string|bigint} input.minBond in wei
 * @param {number} input.openingTime Unix seconds
 * @returns {{errors: string[], tokenNames: string[], params: Array|null}}
 *   params is null when there are errors; tokenNames are the prefixes used
 */
export function buildCategoricalProposal({
    marketName,
    outcomes = [],
    tokenNames = [],
    companyToken,
    currencyToken,
    companySymbol,
    currencySymbol,
    category,
    language,
    minBond,
    openingTime,
}) {
    const errors = [];
    const answers = outcomes.map((answer) => String(answer ?? '').trim());
    const names = answers.map((answer, i) => String(tokenNames[i] ?? '').trim() || defaultTokenName(answer));

    const question = String(marketName ?? '').trim();
    if (!question) errors.push('The question is required.');
    if (/["\\]/.test(question) || question.includes(REALITY_SEPARATOR)) {
        errors.push('The question cannot contain double quotes, backslashes or \u241f; use typographic quotes (\u201c \u201d).');
    }
    if (answers.length < 2) errors.push('A categorical question needs at least 2 answers.');
    if (answers.length > MAX_CATEGORICAL_OUTCOMES) {
        errors.push(`At most ${MAX_CATEGORICAL_OUTCOMES} answers fit in one transaction.`);
    }
    if (answers.some((answer) => !answer)) errors.push('Every answer needs a text.');
    if (answers.some((answer) => answer.includes(REALITY_SEPARATOR))) errors.push('An answer cannot contain \u241f.');
    if (new Set(answers.map((answer) => answer.toLowerCase())).size !== answers.length) {
        errors.push('Two answers are the same.');
    }

    if (names.some((name) => !name)) errors.push('Every answer needs a token name.');
    const upperNames = names.map((name) => name.toUpperCase());
    if (new Set(upperNames).size !== names.length) errors.push('Two answers have the same token name.');
    if (upperNames.includes('INVALID')) errors.push('INVALID is the token name of the Invalid outcome.');
    for (const symbol of [companySymbol, currencySymbol].filter(Boolean)) {
        const tooLong = names.filter((name) => byteLength(`${name}_${symbol}`) > MAX_TOKEN_NAME_BYTES);
        if (tooLong.length > 0) {
            errors.push(`Token names must fit in ${MAX_TOKEN_NAME_BYTES} bytes with "_${symbol}": shorten ${tooLong.join(', ')}.`);
        }
    }

    if (!Number.isInteger(Number(openingTime)) || Number(openingTime) <= 0) {
        errors.push('The opening time is required.');
    }

    return {
        errors,
        tokenNames: names,
        params: errors.length > 0 ? null : [
            question,
            answers.map(escapeRealityText),
            names,
            companyToken,
            currencyToken,
            category,
            language,
            String(minBond),
            Number(openingTime),
        ],
    };
}
