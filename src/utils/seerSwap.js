/**
 * Futarchy conditional-pool swaps through @seer-pm/sdk.
 *
 * The SDK asks Seer's on-chain Lens quoter for the best route between two
 * tokens and returns calldata for the official DEX router: Swapr (Algebra) on
 * Gnosis, Uniswap on Ethereum. The quoted amounts and the calldata come from
 * the same call, so the minimum the dialog shows is the minimum the
 * transaction enforces. One executor for both chains; approvals are plain
 * ERC20 approve() to the router (no Permit2).
 *
 * The SDK is loaded on demand: only the trade panel and dialog need it.
 */

import { createPublicClient, erc20Abi, fallback, formatUnits, http } from 'viem';
import { gnosis, mainnet } from 'viem/chains';
import { RPC_ENDPOINTS } from '../config/rpcEndpoints';
import { approvalAmountFor } from './approvalAmount';
import { isSafeWallet } from './ethersAdapters';
import { SAFE_TRANSACTION_SENT, assertReceiptSucceeded } from './txErrors';

const loadSdk = () => import('@seer-pm/sdk');

const VIEM_CHAINS = { 1: mainnet, 100: gnosis };

// DEX the Lens quoter routes through on each chain, for the dialog's "Protocol" row
export const SEER_ROUTE_NAMES = { 1: 'Uniswap (via Seer)', 100: 'Swapr (via Seer)' };

// Router a trade usually approves (@seer-pm/lens CHAINS): Uniswap V3 SwapRouter02 on
// Ethereum, Swapr on Gnosis. A quote's own approveAddress wins; on Ethereum it can
// also be the Uniswap V4 router.
export const SEER_DEFAULT_SWAP_ROUTER = {
    1: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    100: '0xfFB643E73f280B97809A8b41f7232AB401a04ee1',
};

const clients = new Map();

/**
 * Read client for a chain over the app's RPC list. The Lens quoter simulates
 * with eth_call state overrides, which both default public endpoints support.
 */
export const getSeerPublicClient = (chainId) => {
    const id = Number(chainId);
    if (!clients.has(id)) {
        const chain = VIEM_CHAINS[id];
        if (!chain) throw new Error(`Seer swaps are not available on chain ${chainId}`);
        clients.set(id, createPublicClient({
            chain,
            transport: fallback(RPC_ENDPOINTS[id].map((url) => http(url))),
            batch: { multicall: true },
        }));
    }
    return clients.get(id);
};

const tokens = new Map();

const readToken = async (client, chainId, address) => {
    const key = `${chainId}:${address.toLowerCase()}`;
    if (!tokens.has(key)) {
        const read = Promise.all([
            client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
            client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
        ]).then(([decimals, symbol]) => ({ address, chainId: Number(chainId), decimals: Number(decimals), symbol }));
        tokens.set(key, read);
        read.catch(() => tokens.delete(key));
    }
    return tokens.get(key);
};

/**
 * Exact-input quote for tokenIn → tokenOut, returned as an SDK AmmTrade
 * (amountOut, minimumAmountOut(), approveAddress, and the swap calldata).
 *
 * @param {object} p
 * @param {number} p.chainId
 * @param {string} [p.account] recipient baked into the calldata
 * @param {string} p.tokenIn
 * @param {string} p.tokenOut
 * @param {bigint|string} [p.amountInRaw] input in raw units, or
 * @param {string} [p.amount] input as a decimal string
 * @param {number} p.slippageBps
 */
export const quoteSeerSwap = async ({ chainId, account, tokenIn, tokenOut, amountInRaw, amount, slippageBps }) => {
    const { quoteAmmTrade, TradeType } = await loadSdk();
    const client = getSeerPublicClient(chainId);
    const [inToken, outToken] = await Promise.all([
        readToken(client, chainId, tokenIn),
        readToken(client, chainId, tokenOut),
    ]);
    // The SDK names the two sides of a market trade: selling tokenIn
    // ("outcome") for tokenOut ("collateral") is a plain exact-input swap.
    return quoteAmmTrade(client, {
        chainId: Number(chainId),
        account,
        amount: amountInRaw !== undefined && amountInRaw !== null
            ? formatUnits(BigInt(amountInRaw.toString()), inToken.decimals)
            : String(amount),
        outcomeToken: inToken,
        collateralToken: outToken,
        swapType: 'sell',
        maxSlippage: String(slippageBps / 100),
        tradeType: TradeType.EXACT_INPUT,
    });
};

// A quote's calldata carries a deadline five minutes after it was built
// (@seer-pm/lens defaultDeadline). Past this age it is rebuilt before sending.
export const MAX_QUOTE_AGE_MS = 60_000;

/**
 * Approves the router if needed, then sends the quoted swap.
 * Returns the swap's transaction hash (a safeTxHash from a Safe).
 * A Safe that queues the approval throws SAFE_TRANSACTION_SENT, like the
 * other approval helpers, so the caller shows it as sent rather than failed.
 * Pass `isSafe` from useSafeConnection(): a Safe connected over WalletConnect
 * cannot be told from the wallet client and connector alone.
 *
 * The swap is the last of up to three signatures (collateral split, approval,
 * swap), each followed by a wait for the chain. When an approval was needed,
 * or the quote is older than MAX_QUOTE_AGE_MS, `requote` is called for a fresh
 * trade just before the swap is sent, so the swap never goes out with a
 * deadline that passed while the user was signing. `requote` must return a
 * trade that still honours what the user confirmed, or throw.
 *
 * @param {object} p
 * @param {() => Promise<object>} [p.requote] returns a fresh trade for the same swap
 * @param {number} [p.quotedAt] Date.now() when `trade` was quoted
 */
export const executeSeerSwap = async ({
    trade,
    account,
    walletClient,
    connector,
    isSafe = isSafeWallet(walletClient, connector),
    useUnlimitedApproval = false,
    onApprovalNeeded,
    onApprovalComplete,
    requote,
    quotedAt = Date.now(),
}) => {
    const { fetchNeededApprovals, tradeTokens } = await loadSdk();
    const client = getSeerPublicClient(trade.chainId);

    // Returns true when an approval was sent (and mined).
    const approveIfNeeded = async (trade) => {
        const amountIn = trade.maximumAmountIn();
        const [needed] = await fetchNeededApprovals(client, [trade.tokenIn.address], account, trade.approveAddress, [amountIn]);
        if (!needed) return false;
        onApprovalNeeded?.();
        const approveHash = await walletClient.writeContract({
            address: trade.tokenIn.address,
            abi: erc20Abi,
            functionName: 'approve',
            args: [trade.approveAddress, approvalAmountFor(amountIn.toString(), useUnlimitedApproval).toBigInt()],
            account,
            chain: walletClient.chain,
        });
        if (isSafe) throw new Error(SAFE_TRANSACTION_SENT);
        const receipt = await client.waitForTransactionReceipt({ hash: approveHash });
        assertReceiptSucceeded(receipt, approveHash);
        return true;
    };

    let tradeToSend = trade;
    const approved = await approveIfNeeded(trade);
    if (requote && (approved || Date.now() - quotedAt > MAX_QUOTE_AGE_MS)) {
        tradeToSend = await requote();
        // The fresh route can go through a different router (Uniswap V3 or V4
        // on Ethereum), which then needs its own approval.
        await approveIfNeeded(tradeToSend);
    }
    onApprovalComplete?.();

    return tradeTokens({ trade: tradeToSend, account, isTradingCredits: false }, { client: walletClient });
};
