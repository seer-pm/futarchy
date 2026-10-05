/**
 * Winning outcome positions a wallet holds unwrapped, as ERC1155 balances on
 * ConditionalTokens, and redeeming them.
 *
 * The futarchy router only redeems the wrapped ERC20 outcome tokens. A
 * position that was never wrapped (or was unwrapped again) is redeemed on
 * ConditionalTokens itself: redeemPositions burns the caller's balance and
 * pays the collateral straight to them, with no approval.
 *
 * Position ids are derived on-chain from the proposal (conditionId, parent
 * collection, collateral), so they are right for every market.
 */

import { parseAbi } from 'viem';
import { SAFE_TRANSACTION_SENT, assertReceiptSucceeded } from './txErrors.js';

const PROPOSAL_ABI = parseAbi([
    'function conditionId() view returns (bytes32)',
    'function parentCollectionId() view returns (bytes32)',
    'function collateralToken1() view returns (address)',
    'function collateralToken2() view returns (address)',
]);

const CONDITIONAL_TOKENS_ABI = parseAbi([
    'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
    'function getPositionId(address collateralToken, bytes32 collectionId) pure returns (uint256)',
    'function balanceOf(address owner, uint256 id) view returns (uint256)',
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
]);

const ZERO_COLLECTION = `0x${'0'.repeat(64)}`;

// Outcome slot 0 is YES and slot 1 is NO for futarchy proposals; an index set
// is the bit mask of the slots it covers.
const INDEX_SET = { yes: 1n, no: 2n };

/**
 * @param {object} p
 * @param {object} p.publicClient viem public client on the market's chain
 * @param {string} p.proposal FutarchyProposal address
 * @param {string} p.conditionalTokens ConditionalTokens address
 * @param {string} p.account wallet address
 * @param {'yes'|'no'} p.side the winning side
 * @returns {Promise<{conditionId: string, parentCollectionId: string, indexSet: bigint,
 *   redeemable: boolean, positions: Array<{role: 'company'|'currency', collateral: string, positionId: bigint, balance: bigint}>}>}
 *   `redeemable` is false for a nested market (non-zero parent collection):
 *   there redeemPositions pays out parent positions, not collateral.
 */
export async function fetchUnwrappedWinnings({ publicClient, proposal, conditionalTokens, account, side }) {
    const indexSet = INDEX_SET[side];
    if (!indexSet) throw new Error(`No winning side to redeem for "${side}"`);

    const read = (address, abi, functionName, args = []) =>
        publicClient.readContract({ address, abi, functionName, args });

    const [conditionId, parentCollectionId, companyCollateral, currencyCollateral] = await Promise.all([
        read(proposal, PROPOSAL_ABI, 'conditionId'),
        read(proposal, PROPOSAL_ABI, 'parentCollectionId'),
        read(proposal, PROPOSAL_ABI, 'collateralToken1'),
        read(proposal, PROPOSAL_ABI, 'collateralToken2'),
    ]);
    const collectionId = await read(conditionalTokens, CONDITIONAL_TOKENS_ABI, 'getCollectionId', [parentCollectionId, conditionId, indexSet]);

    const positions = await Promise.all([
        { role: 'company', collateral: companyCollateral },
        { role: 'currency', collateral: currencyCollateral },
    ].map(async (position) => {
        const positionId = await read(conditionalTokens, CONDITIONAL_TOKENS_ABI, 'getPositionId', [position.collateral, collectionId]);
        const balance = await read(conditionalTokens, CONDITIONAL_TOKENS_ABI, 'balanceOf', [account, positionId]);
        return { ...position, positionId, balance };
    }));

    return {
        conditionId,
        parentCollectionId,
        indexSet,
        redeemable: parentCollectionId.toLowerCase() === ZERO_COLLECTION,
        positions,
    };
}

/**
 * Redeems every position with a balance, one transaction per collateral.
 * Returns the transaction hashes. A Safe queues the transaction instead of
 * mining it, so that case throws SAFE_TRANSACTION_SENT after the first one,
 * like the other transaction helpers.
 *
 * @param {object} p
 * @param {object} p.winnings result of fetchUnwrappedWinnings
 * @param {boolean} [p.isSafe] the connected wallet is a Safe
 * @param {(position: object) => void} [p.onSubmitting] called before each transaction
 */
export async function redeemUnwrappedWinnings({ publicClient, walletClient, conditionalTokens, account, winnings, isSafe = false, onSubmitting }) {
    if (!winnings.redeemable) throw new Error('These positions belong to a nested market and cannot be redeemed to collateral here');

    const hashes = [];
    for (const position of winnings.positions) {
        if (position.balance <= 0n) continue;
        onSubmitting?.(position);
        const hash = await walletClient.writeContract({
            address: conditionalTokens,
            abi: CONDITIONAL_TOKENS_ABI,
            functionName: 'redeemPositions',
            args: [position.collateral, winnings.parentCollectionId, winnings.conditionId, [winnings.indexSet]],
            account,
            chain: walletClient.chain,
        });
        hashes.push(hash);
        if (isSafe) throw new Error(SAFE_TRANSACTION_SENT);
        assertReceiptSucceeded(await publicClient.waitForTransactionReceipt({ hash }), hash);
    }
    return hashes;
}
