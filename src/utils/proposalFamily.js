/**
 * Families of categorical futarchy proposals, shown as one market.
 *
 * FutarchyCategoricalFactory (seer-pm/demo) can create a proposal conditional
 * on an answer of another one (parentMarket / parentOutcome), as Seer chains
 * markets on "Other": a question with candidates A, B, C and Other gets a
 * later question with D and Other, whose tokens are split from the first
 * question's Other tokens and redeem to them. A family is a root proposal and
 * every proposal chained to its answers, at any depth.
 *
 * Each answer of a family is one of:
 *   - a leaf: an answer with no proposal chained to it (A, B, C, D, the last
 *     Other). The market shows these as its answers;
 *   - chained: an answer another proposal splits (the first Other). Its tokens
 *     and pools exist, but the market shows the chained proposal's answers.
 * The chance of a leaf is the product of the prediction prices on its path:
 * the chained proposal's prediction pools trade its answers against the
 * parent answer's currency token, so they price the chance given that answer.
 * The company token's price if a leaf wins is its own conditional pool's.
 *
 * A proposal conditional on an answer splits that answer's tokens, one per
 * collateral: its "source" for a collateral is the parent answer's token of
 * that collateral, and the collateral itself for the root. The router
 * (FutarchyCategoricalRouter) takes the collateral as argument in both cases.
 */

import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';
import { fetchOutcomePools, fetchProposalOutcomes } from './proposalOutcomes.js';

// FutarchyCategoricalFactory per chain, whose proposals are searched for the
// ones chained to a family's answers.
export const CATEGORICAL_FACTORY_BY_CHAIN = {
    1: process.env.NEXT_PUBLIC_MAINNET_FUTARCHY_CATEGORICAL_FACTORY || null,
    100: process.env.NEXT_PUBLIC_GNOSIS_FUTARCHY_CATEGORICAL_FACTORY || '0x4e79be3a63b09d22D4DAfcd66Feb00535A654295',
};

const FACTORY_ABI = parseAbi([
    'function marketsCount() view returns (uint256)',
    'function proposals(uint256) view returns (address)',
]);
const PARENT_ABI = parseAbi(['function parentMarket() view returns (address)', 'function parentOutcome() view returns (uint256)']);
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
// Deeper chains are not followed: a market with this many follow-up questions is not one people can read.
const MAX_DEPTH = 8;

const lower = (address) => String(address ?? '').toLowerCase();

async function read(provider, address, abi, functionName, args = []) {
    const data = await provider.send('eth_call', [
        { to: address, data: encodeFunctionData({ abi, functionName, args }) },
        'latest',
    ]);
    return decodeFunctionResult({ abi, functionName, data });
}

/**
 * The proposals of `factory` chained to another proposal, by parent.
 * @returns {Promise<Map<string, Array<{address: string, parentOutcome: number}>>>} keyed by
 *   lowercase parent address, in creation order
 */
export async function fetchChainedProposals(factory, provider) {
    const count = Number(await read(provider, factory, FACTORY_ABI, 'marketsCount'));
    const addresses = await Promise.all(Array.from({ length: count }, (_, i) => read(provider, factory, FACTORY_ABI, 'proposals', [BigInt(i)])));
    const parents = await Promise.all(addresses.map((address) => Promise.all([
        read(provider, address, PARENT_ABI, 'parentMarket'),
        read(provider, address, PARENT_ABI, 'parentOutcome'),
    ]).catch(() => [ZERO_ADDRESS, 0n])));
    const byParent = new Map();
    addresses.forEach((address, i) => {
        const [parent, outcome] = parents[i];
        if (parent === ZERO_ADDRESS) return;
        const list = byParent.get(lower(parent)) ?? [];
        list.push({ address, parentOutcome: Number(outcome) });
        byParent.set(lower(parent), list);
    });
    return byParent;
}

/**
 * Builds a family from proposals already read (fetchProposalOutcomes) and the
 * chained proposals by parent. One proposal per answer: when several are
 * chained to the same answer the first created is used and a warning says so.
 * @param {object} root fetchProposalOutcomes of the root
 * @param {Map<string, Array<{address: string, parentOutcome: number}>>} chained
 * @param {Map<string, object>} proposals fetchProposalOutcomes by lowercase address
 * @returns {{root: object, warnings: Array<{code: string, message: string}>}}
 */
export function buildFamily(root, chained, proposals) {
    const warnings = [];
    const build = (proposal, parent, depth) => {
        const node = { proposal, parent, children: new Map(), depth };
        if (depth >= MAX_DEPTH) return node;
        for (const { address, parentOutcome } of chained.get(lower(proposal.address)) ?? []) {
            const child = proposals.get(lower(address));
            if (!child || child.kind !== 'categorical' || parentOutcome >= proposal.outcomes.length
                || lower(child.companyToken) !== lower(proposal.companyToken)
                || lower(child.currencyToken) !== lower(proposal.currencyToken)) continue;
            if (node.children.has(parentOutcome)) {
                warnings.push({
                    code: 'several-chained-proposals',
                    message: `More than one question follows up on \u201c${proposal.outcomes[parentOutcome].label}\u201d. This market shows the first one, ${node.children.get(parentOutcome).proposal.address}; ${address} is not shown.`,
                });
                continue;
            }
            node.children.set(parentOutcome, build(child, { node, index: parentOutcome }, depth + 1));
        }
        return node;
    };
    return { root: build(root, null, 0), warnings };
}

/**
 * The family of a proposal: its root, found by following parentMarket up, and
 * every proposal of `factory` chained below it.
 * @param {string} proposalAddress any proposal of the family
 * @param {{send: Function}} provider batching provider (utils/getBestRpc.js)
 * @param {{chainId?: number, conditionalTokens?: string, factory?: string|null}} [options]
 */
export async function fetchProposalFamily(proposalAddress, provider, { chainId = 100, conditionalTokens, factory } = {}) {
    const options = { chainId, conditionalTokens };
    const proposals = new Map();
    const fetchOne = async (address) => {
        if (!proposals.has(lower(address))) proposals.set(lower(address), await fetchProposalOutcomes(address, provider, options));
        return proposals.get(lower(address));
    };

    const start = await fetchOne(proposalAddress);
    // A Yes/No proposal has no answers to follow up.
    if (start.kind !== 'categorical') return buildFamily(start, new Map(), proposals);
    const factoryAddress = factory === undefined ? CATEGORICAL_FACTORY_BY_CHAIN[Number(chainId) === 1 ? 1 : 100] : factory;
    const chained = factoryAddress ? await fetchChainedProposals(factoryAddress, provider) : new Map();
    let root = start;
    for (let depth = 0; root.parentMarket && depth < MAX_DEPTH; depth++) root = await fetchOne(root.parentMarket);

    // Read every proposal below the root, level by level.
    let level = [root];
    for (let depth = 0; level.length > 0 && depth < MAX_DEPTH; depth++) {
        const next = level.flatMap((proposal) => (chained.get(lower(proposal.address)) ?? []).map(({ address }) => address));
        level = await Promise.all(next.map((address) => fetchOne(address).catch(() => null)));
        level = level.filter((proposal) => proposal?.kind === 'categorical');
    }
    return buildFamily(root, chained, proposals);
}

/** Every proposal of a family, root first, parents before their chained proposals. */
export function familyNodes(family) {
    const nodes = [];
    const visit = (node) => {
        nodes.push(node);
        [...node.children.keys()].sort((a, b) => a - b).forEach((index) => visit(node.children.get(index)));
    };
    visit(family.root);
    return nodes;
}

export const answerKey = (node, index) => `${lower(node.proposal.address)}:${index}`;
export const invalidKey = (node) => `${lower(node.proposal.address)}:invalid`;

/**
 * The token a proposal of the family splits for a side: the parent answer's
 * token, or the collateral for the root.
 * @param {'company'|'currency'} side
 * @returns {{address: string, name: string|null}}
 */
export function sourceToken(node, side) {
    if (!node.parent) {
        return { address: side === 'company' ? node.proposal.companyToken : node.proposal.currencyToken, name: null };
    }
    return node.parent.node.proposal.outcomes[node.parent.index][side];
}

/** The answers above a node, root first: [{node, index}], the answer each proposal on the way is chained to. */
export function ancestors(node) {
    const path = [];
    for (let step = node.parent; step; step = step.node.parent) path.unshift(step);
    return path;
}

/**
 * The answers the market shows, in order: each proposal's answers with the
 * chained ones replaced by the chained proposal's answers.
 * @returns {Array<{key: string, label: string, isInvalid: false, company: object, currency: object,
 *   node: object, index: number, path: Array<{node: object, index: number}>}>}
 */
export function familyLeaves(family) {
    const leaves = [];
    const visit = (node) => node.proposal.outcomes.forEach((outcome, index) => {
        const child = node.children.get(index);
        if (child) visit(child);
        else leaves.push({ key: answerKey(node, index), label: outcome.label, isInvalid: false, ...outcome, node, index, path: ancestors(node) });
    });
    visit(family.root);
    return leaves;
}

/**
 * Every outcome slot of every proposal of the family, for positions: answers,
 * chained answers marked `chained`, and each proposal's INVALID. `depth` 0 is
 * the root's.
 */
export function familySlots(family) {
    return familyNodes(family).flatMap((node) => {
        const via = node.parent ? node.parent.node.proposal.outcomes[node.parent.index].label : null;
        return [
            ...node.proposal.outcomes.map((outcome, index) => ({
                key: answerKey(node, index),
                label: outcome.label,
                isInvalid: false,
                chained: node.children.has(index),
                company: outcome.company,
                currency: outcome.currency,
                node,
                index,
                depth: node.depth,
            })),
            {
                key: invalidKey(node),
                label: via ? `Invalid (${via})` : 'Invalid',
                isInvalid: true,
                chained: false,
                ...node.proposal.invalid,
                node,
                index: node.proposal.outcomes.length,
                depth: node.depth,
            },
        ];
    });
}

const product = (values) => (values.some((value) => typeof value !== 'number') ? null : values.reduce((a, b) => a * b, 1));

/**
 * Adds the pools to the family's answers (fetchOutcomePools per proposal; a
 * chained proposal's prediction pools quote in the parent answer's currency
 * token).
 * @param {Map<object, Array>} poolsByNode fetchOutcomePools result by node
 * @returns {{leaves: Array, all: Array}} leaves: familyLeaves with conditional,
 *   prediction (the chance given the answers above it), chance (the product
 *   down the path) and chancePools (the prediction pools of the path, its own
 *   last); all: every answer of every proposal with its pools, chained ones
 *   included, for the liquidity screens
 */
export function attachFamilyPools(family, poolsByNode) {
    const rowOf = (node, index) => poolsByNode.get(node)?.[index] ?? null;
    const leaves = familyLeaves(family).map((leaf) => {
        const own = rowOf(leaf.node, leaf.index);
        const chancePools = [...leaf.path.map(({ node, index }) => rowOf(node, index)?.prediction ?? null), own?.prediction ?? null];
        return {
            ...leaf,
            quote: own?.quote ?? null,
            conditional: own?.conditional ?? null,
            prediction: own?.prediction ?? null,
            chance: product(chancePools.map((pool) => pool?.price)),
            chancePools,
        };
    });
    const all = familyNodes(family).flatMap((node) => (poolsByNode.get(node) ?? []).map((row, index) => ({
        ...row,
        key: answerKey(node, index),
        label: node.parent ? `${row.label} (${node.parent.node.proposal.outcomes[node.parent.index].label})` : row.label,
    })));
    return { leaves, all };
}

/** Reads every proposal's pools and attaches them (attachFamilyPools). */
export async function fetchFamilyPools(family, provider, { chainId = 100 } = {}) {
    const nodes = familyNodes(family);
    const pools = await Promise.all(nodes.map((node) => fetchOutcomePools(node.proposal, provider, {
        chainId,
        quote: node.parent ? sourceToken(node, 'currency') : { address: node.proposal.currencyToken, name: null },
    })));
    return attachFamilyPools(family, new Map(nodes.map((node, i) => [node, pools[i]])));
}

/** Every token of the family whose balance the positions show: both collaterals and every outcome token. */
export function familyTokens(family) {
    const { companyToken, currencyToken } = family.root.proposal;
    return [companyToken, currencyToken, ...familySlots(family).flatMap((slot) => [slot.company.address, slot.currency.address])];
}

/**
 * Balances of an account in every token of familyTokens, in one batched round.
 * @returns {Promise<Map<string, bigint>>} keyed by lowercase token address
 */
export async function fetchFamilyBalances(family, account, provider) {
    const tokens = familyTokens(family);
    const values = await Promise.all(tokens.map((token) => read(provider, token, ERC20_ABI, 'balanceOf', [account])));
    return new Map(tokens.map((token, i) => [lower(token), values[i]]));
}

const balanceOf = (balances, token) => balances?.get(lower(token)) ?? 0n;
const min = (values) => values.reduce((a, b) => (b < a ? b : a));

/**
 * How much of a side's collateral merging can give back: merging a proposal
 * takes the same amount of every one of its tokens, INVALID included, and the
 * tokens of a chained answer can also come from merging its proposal.
 * @param {'company'|'currency'} side
 */
export function familyMergeable(family, balances, side, node = family.root) {
    const tokens = [...node.proposal.outcomes, node.proposal.invalid];
    return min(tokens.map((outcome, index) => {
        const child = node.children.get(index);
        return balanceOf(balances, outcome[side].address) + (child ? familyMergeable(family, balances, side, child) : 0n);
    }));
}

const step = (node, side, amount) => ({
    proposal: node.proposal.address,
    collateralToken: side === 'company' ? node.proposal.companyToken : node.proposal.currencyToken,
    sourceToken: sourceToken(node, side),
    amount,
    node,
});

/**
 * Splitting `amount` of a side's collateral into the market's answers: the
 * root, then every chained proposal with the same amount of the answer's
 * tokens it is chained to, parents first.
 * @returns {Array<{proposal: string, collateralToken: string, sourceToken: {address: string, name: string|null}, amount: bigint, node: object}>}
 */
export function familySplitPlan(family, side, amount) {
    return familyNodes(family).map((node) => step(node, side, amount));
}

/**
 * Merging `amount` of every answer back into a side's collateral: what the
 * account lacks of a chained answer's tokens is merged from its proposal
 * first, so the steps run deepest first and the root last.
 * @returns {Array<{proposal: string, collateralToken: string, outcomeTokens: string[], amount: bigint, node: object}>}
 */
export function familyMergePlan(family, side, amount, balances, node = family.root) {
    const tokens = [...node.proposal.outcomes, node.proposal.invalid];
    const childSteps = [...node.children.entries()].sort(([a], [b]) => a - b).flatMap(([index, child]) => {
        const short = amount - balanceOf(balances, tokens[index][side].address);
        return short > 0n ? familyMergePlan(family, side, short, balances, child) : [];
    });
    return [...childSteps, { ...step(node, side, amount), outcomeTokens: tokens.map((outcome) => outcome[side].address) }];
}

/**
 * What a trade spending `amount` of a leaf's token of a side has to split
 * first: what the account lacks of it comes from splitting the leaf's
 * proposal, whose source token comes from its parent's, and so on up to the
 * collateral. Parents first.
 * @param {object} leaf familyLeaves row
 * @returns {{steps: Array, available: bigint}} available is the most the
 *   account can spend: the token held plus every source above it
 */
export function tradeSplitPlan(leaf, side, amount, balances) {
    const nodes = [...leaf.path.map(({ node }) => node), leaf.node];
    const held = (token) => balanceOf(balances, token.address);
    const steps = [];
    let need = amount - held(leaf[side]);
    for (let i = nodes.length - 1; i >= 0 && need > 0n; i--) {
        steps.unshift(step(nodes[i], side, need));
        need -= held(sourceToken(nodes[i], side));
    }
    const available = held(leaf[side]) + nodes.reduce((total, node) => total + held(sourceToken(node, side)), 0n);
    return { steps, available };
}

/**
 * The resolution of a family from each proposal's (fetchOnChainResolutions):
 * the root's winning answer, and when a proposal is chained to it that
 * proposal's, down to a leaf or INVALID.
 * @param {(node: object) => {resolved: boolean, outcome?: string, outcomeIndex?: number}|null} resolutionOf
 * @returns {{resolved: boolean, winner: object|null, pending: object|null, paid: Array<{node: object, index: number}>}}
 *   winner: the familyLeaves or familySlots row that pays; pending: the
 *   chained proposal still unresolved below a resolved answer; paid: the
 *   slot each resolved proposal on the way pays, root first
 */
export function familyResolution(family, resolutionOf) {
    const paid = [];
    for (let node = family.root; node;) {
        const resolution = resolutionOf(node);
        if (!resolution?.resolved) return { resolved: false, winner: null, pending: node === family.root ? null : node, paid };
        const answers = node.proposal.outcomes.length;
        const index = resolution.outcome === 'invalid' ? answers : resolution.outcomeIndex;
        if (!Number.isInteger(index) || index > answers) return { resolved: true, winner: null, pending: null, paid };
        paid.push({ node, index });
        const child = node.children.get(index);
        if (!child) {
            const winner = familySlots(family).find((slot) => slot.node === node && slot.index === index);
            return { resolved: true, winner, pending: null, paid };
        }
        node = child;
    }
    return { resolved: false, winner: null, pending: null, paid };
}

/**
 * Redeeming what won: the deepest resolved proposal first, whose winning
 * tokens pay the parent answer's tokens, then each parent with what it held
 * plus what the step below paid. A chained proposal that is not resolved yet
 * keeps its tokens; the steps above redeem what is already held.
 * @param {ReturnType<typeof familyResolution>} resolution
 * @returns {Array<{proposal: string, node: object, company: object, currency: object, amounts: {company: bigint, currency: bigint}}>}
 *   deepest first, only steps with something to redeem
 */
export function familyRedeemPlan(resolution, balances) {
    const steps = [];
    let paidBelow = { company: 0n, currency: 0n };
    for (const { node, index } of [...resolution.paid].reverse()) {
        const slot = index < node.proposal.outcomes.length ? node.proposal.outcomes[index] : node.proposal.invalid;
        const amounts = {
            company: balanceOf(balances, slot.company.address) + paidBelow.company,
            currency: balanceOf(balances, slot.currency.address) + paidBelow.currency,
        };
        steps.push({ proposal: node.proposal.address, node, company: slot.company, currency: slot.currency, amounts });
        paidBelow = amounts;
    }
    return steps.filter(({ amounts }) => amounts.company > 0n || amounts.currency > 0n);
}

/**
 * The chance history of an answer down its path, from the price history of
 * each prediction pool on the way (attachFamilyPools chancePools): at every
 * time any of them has a point, the product of each one's latest price. It
 * starts once every pool has a price.
 * @param {Array<Array<{timestamp: number, price: number}>>} seriesList oldest first each
 * @returns {Array<{timestamp: number, price: number}>}
 */
export function chanceHistory(seriesList) {
    if (seriesList.length === 0 || seriesList.some((series) => series.length === 0)) return [];
    if (seriesList.length === 1) return seriesList[0];
    const times = [...new Set(seriesList.flatMap((series) => series.map((point) => point.timestamp)))].sort((a, b) => a - b);
    const cursors = seriesList.map(() => -1);
    const points = [];
    for (const time of times) {
        seriesList.forEach((series, i) => {
            while (cursors[i] + 1 < series.length && series[cursors[i] + 1].timestamp <= time) cursors[i] += 1;
        });
        if (cursors.some((cursor) => cursor < 0)) continue;
        points.push({ timestamp: time, price: seriesList.reduce((total, series, i) => total * series[cursors[i]].price, 1) });
    }
    return points;
}
