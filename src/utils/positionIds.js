/**
 * ERC1155 position ids of a futarchy proposal's four outcome positions on
 * ConditionalTokens: YES and NO for each of the two collaterals.
 *
 * They are derived from the proposal on-chain. A position id depends on the
 * proposal's condition, its parent collection and the collateral token, so
 * every market has its own four; they cannot be constants in the config.
 */

import { ethers } from 'ethers';

const PROPOSAL = new ethers.utils.Interface([
    'function conditionId() view returns (bytes32)',
    'function parentCollectionId() view returns (bytes32)',
    'function collateralToken1() view returns (address)',
    'function collateralToken2() view returns (address)',
]);

const CONDITIONAL_TOKENS = new ethers.utils.Interface([
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function getPositionId(address collateralToken, bytes32 collectionId) pure returns (uint256)',
]);

// Outcome slot 0 is YES and slot 1 is NO; an index set is the bit mask of the
// slots it covers.
const YES_INDEX_SET = 1;
const NO_INDEX_SET = 2;

const cache = new Map();

const call = async (provider, iface, to, fn, args = []) => {
    const data = await provider.call({ to, data: iface.encodeFunctionData(fn, args) });
    return iface.decodeFunctionResult(fn, data)[0];
};

/**
 * @param {object} p
 * @param {{call: Function}} p.provider ethers v5 provider on the market's chain
 * @param {number|string} p.chainId
 * @param {string} p.proposal FutarchyProposal address
 * @param {string} p.conditionalTokens ConditionalTokens address
 * @returns {Promise<{currencyYes: string, currencyNo: string, companyYes: string, companyNo: string}>}
 *   ids as decimal strings. collateralToken1 is the company token and
 *   collateralToken2 the currency token. Rejects if a read fails; only
 *   successful results are cached.
 */
export function fetchPositionIds({ provider, chainId, proposal, conditionalTokens }) {
    const key = `${Number(chainId)}:${String(proposal).toLowerCase()}:${String(conditionalTokens).toLowerCase()}`;
    if (!cache.has(key)) {
        const derived = (async () => {
            const [conditionId, parentCollectionId, companyCollateral, currencyCollateral] = await Promise.all([
                call(provider, PROPOSAL, proposal, 'conditionId'),
                call(provider, PROPOSAL, proposal, 'parentCollectionId'),
                call(provider, PROPOSAL, proposal, 'collateralToken1'),
                call(provider, PROPOSAL, proposal, 'collateralToken2'),
            ]);
            const [yesCollection, noCollection] = await Promise.all([YES_INDEX_SET, NO_INDEX_SET].map((indexSet) =>
                call(provider, CONDITIONAL_TOKENS, conditionalTokens, 'getCollectionId', [parentCollectionId, conditionId, indexSet])
            ));
            const positionId = async (collateral, collection) =>
                (await call(provider, CONDITIONAL_TOKENS, conditionalTokens, 'getPositionId', [collateral, collection])).toString();
            const [currencyYes, currencyNo, companyYes, companyNo] = await Promise.all([
                positionId(currencyCollateral, yesCollection),
                positionId(currencyCollateral, noCollection),
                positionId(companyCollateral, yesCollection),
                positionId(companyCollateral, noCollection),
            ]);
            return { currencyYes, currencyNo, companyYes, companyNo };
        })();
        cache.set(key, derived);
        derived.catch(() => cache.delete(key));
    }
    return cache.get(key);
}
