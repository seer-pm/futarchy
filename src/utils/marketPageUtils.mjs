/**
 * Pure helpers for the market page (MarketPageShowcase and friends).
 *
 * Kept dependency-free and in .mjs so auto-qa/tests can import the real
 * implementation instead of a spec mirror.
 */

/**
 * Signed conditional-price impact in percent: (YES - NO) / max(YES, NO) * 100.
 * Returns null when either price is missing or not a positive finite number.
 */
export function computeImpactPercent(yesPrice, noPrice) {
    const yes = Number(yesPrice);
    const no = Number(noPrice);
    if (yesPrice === null || yesPrice === undefined || noPrice === null || noPrice === undefined) return null;
    if (!Number.isFinite(yes) || !Number.isFinite(no)) return null;
    const denominator = Math.max(yes, no);
    if (!(denominator > 0)) return null;
    return ((yes - no) / denominator) * 100;
}

/**
 * The one impact formatter for the market page: two decimals, explicit sign,
 * and "<0.01%" for non-zero values that would otherwise round to 0.00%.
 *   0.3569   -> "+0.36%"
 *  -0.99     -> "-0.99%"
 *   0.00004  -> "<0.01%"
 *   0        -> "0.00%"
 * Missing / non-numeric input returns the fallback ("N/A").
 */
export function formatImpactPercent(value, fallback = 'N/A') {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    if (num === 0) return '0.00%';
    if (Math.abs(num) < 0.005) return '<0.01%';
    const sign = num > 0 ? '+' : '-';
    return `${sign}${Math.abs(num).toFixed(2)}%`;
}

// Reality.eth v3 contracts per chain (same as REALITY_CONFIG in
// components/debug/constants/chainConfig.js).
export const REALITY_CONTRACTS = {
    1: '0x5b7dD1E86623548AF054A4985F7fc8Ccbb554E2c',
    100: '0xE78996A233895bE74a66F451f1019cA9734205cc',
};

/**
 * Build a Reality.eth question URL that actually opens the question.
 * The old ".../app/#!/network/100/token/XDAI/question/..." form now
 * redirects to Reality's front page; this form deep-links correctly.
 */
export function buildRealityQuestionUrl(chainId, contract, questionId) {
    if (!chainId || !contract || !questionId) return null;
    return `https://reality.eth.limo/#!/network/${Number(chainId)}/question/${String(contract).toLowerCase()}-${String(questionId).toLowerCase()}`;
}

/**
 * Rewrite any Reality.eth question link (old /app/ + /token/ forms included)
 * into the working deep-link form. Non-Reality links are returned unchanged.
 * The chain in the link wins; fallbackChainId is used when it has none.
 */
export function normalizeRealityQuestionUrl(url, fallbackChainId = null) {
    if (!url || typeof url !== 'string') return url ?? null;
    if (!/reality\.eth/i.test(url)) return url;
    const question = url.match(/question\/(0x[0-9a-fA-F]{40})-(0x[0-9a-fA-F]{64})/);
    if (!question) return url;
    const network = url.match(/network\/(\d+)/);
    const chainId = network ? Number(network[1]) : fallbackChainId;
    if (!chainId) return url;
    return buildRealityQuestionUrl(chainId, question[1], question[2]);
}

const isCompanyRole = (role) => role === 'YES_COMPANY' || role === 'NO_COMPANY' || role === 'COMPANY';

/**
 * Execution price of a conditional-pool swap, in currency per company token,
 * computed from the amounts actually exchanged (not the pool's post-trade
 * price). Returns null when the company side can't be identified from token
 * roles or the amounts are unusable, so callers can fall back.
 *
 * @param {{amountIn, amountOut, tokenIn?: {role}, tokenOut?: {role}}} swap
 *        amounts are human-readable decimals (subgraph BigDecimal)
 */
export function computeExecutionPrice(swap) {
    if (!swap) return null;
    const amountIn = Number(swap.amountIn);
    const amountOut = Number(swap.amountOut);
    if (!(amountIn > 0) || !(amountOut > 0)) return null;
    const inIsCompany = isCompanyRole(swap.tokenIn?.role || '');
    const outIsCompany = isCompanyRole(swap.tokenOut?.role || '');
    if (outIsCompany && !inIsCompany) return amountIn / amountOut; // buy: paid currency for company
    if (inIsCompany && !outIsCompany) return amountOut / amountIn; // sell: got currency for company
    return null;
}

/**
 * Proposal address a market page should load.
 *
 * The explicit prop / path address wins. ?proposalId= is only honoured on the
 * legacy /market route, so /markets/0xA?proposalId=0xB can no longer show A's
 * title while trading B.
 *
 * @param {string|null} propProposalId - proposal passed by the caller
 * @param {{pathname?: string, search?: string}|null} location - window.location
 */
export function resolveProposalId(propProposalId, location) {
    if (propProposalId) return propProposalId;
    if (!location) return null;
    const pathname = location.pathname || '';
    const pathMatch = pathname.match(/^\/markets\/(0x[0-9a-fA-F]{40})\/?$/);
    if (pathMatch) return pathMatch[1];
    if (/^\/market\/?$/.test(pathname)) {
        const params = new URLSearchParams(location.search || '');
        return params.get('proposalId') || null;
    }
    return null;
}
