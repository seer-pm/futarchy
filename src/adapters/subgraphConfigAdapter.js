/**
 * Subgraph Data Adapter
 * 
 * Fetches proposal data from The Graph subgraph and transforms it 
 * to match the Supabase market_event format for seamless consumption.
 */

import { createPublicClient, http, fallback } from 'viem';
import { fetchProposalMarketData } from '../services/proposalMarketData';
import { RPC_ENDPOINTS } from '../config/rpcEndpoints';
import { gnosis, mainnet } from 'viem/chains';
import { SUBGRAPH_ENDPOINTS } from '../config/subgraphEndpoints';

// Re-export for backward compatibility
export { SUBGRAPH_ENDPOINTS };

// Chain-specific contract addresses
const CHAIN_CONFIG = {
    1: {
        factoryAddress: '0xf9369c0F7a84CAC3b7Ef78c837cF7313309D3678',
        routerAddress: '0xAc9Bf8EbA6Bd31f8E8c76f8E8B2AAd0BD93f98Dc',
        futarchyAdapter: '0xAc9Bf8EbA6Bd31f8E8c76f8E8B2AAd0BD93f98Dc',
        conditionalTokens: '0xC59b0e4De5F1248C1140964E0fF287B192407E0C',
        wrapperService: '0x...', // TODO: Add mainnet wrapper
        // Uniswap V3 factory (Ethereum) — for the on-chain pool-discovery fallback
        ammFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        viemChain: mainnet,
        rpcUrls: RPC_ENDPOINTS[1]
    },
    100: {
        factoryAddress: '0xa6cB18FCDC17a2B44E5cAd2d80a6D5942d30a345',
        routerAddress: '0x7495a583ba85875d59407781b4958ED6e0E1228f',
        futarchyAdapter: '0x7495a583ba85875d59407781b4958ED6e0E1228f',
        conditionalTokens: '0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce',
        wrapperService: '0xc14f5d2B9d6945EF1BA93f8dB20294b90FA5b5b1',
        // Algebra (Swapr) factory on Gnosis — for the on-chain pool-discovery fallback
        ammFactory: '0xA0864cCA6E114013AB0e27cbd5B6f4c8947da766',
        viemChain: gnosis,
        rpcUrls: RPC_ENDPOINTS[100]
    }
};

// Minimal ABIs for the on-chain fallback (when the candles subgraph has not
// yet indexed a freshly-created proposal).
const PROPOSAL_ABI = [
    { name: 'marketName', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
    { name: 'collateralToken1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { name: 'collateralToken2', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { name: 'wrappedOutcome', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'bytes' }] }
];
const ERC20_SYMBOL_ABI = [
    { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
    { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }
];
// Algebra: poolByPair(a,b); Uniswap V3: getPool(a,b,fee). We try Algebra first
// (Gnosis) and fall back to the UniV3 signature (Ethereum).
const ALGEBRA_FACTORY_ABI = [
    { name: 'poolByPair', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] }
];
const UNIV3_FACTORY_ABI = [
    { name: 'getPool', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }], outputs: [{ type: 'address' }] }
];

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

// Cache one public client per chain so we don't rebuild transports per call.
const _clients = {};
function getPublicClient(chainId) {
    if (_clients[chainId]) return _clients[chainId];
    const cfg = CHAIN_CONFIG[chainId];
    if (!cfg) return null;
    const client = createPublicClient({
        chain: cfg.viemChain,
        transport: fallback((cfg.rpcUrls || []).map(u => http(u, { batch: true }))),
    });
    _clients[chainId] = client;
    return client;
}

/**
 * On-chain fallback: assemble the same shape as fetchProposalFromSubgraph by
 * reading the proposal contract directly. Used when the candles subgraph has
 * not yet indexed a freshly-created proposal, so the market page (balances,
 * swap panel, add-liquidity links, token symbols) works immediately instead
 * of failing with "not found".
 *
 * wrappedOutcome index map: 0=YES_COMPANY, 1=NO_COMPANY, 2=YES_CURRENCY, 3=NO_CURRENCY.
 * Pools are discovered via the AMM factory (CONDITIONAL pools only — the side
 * that gates basic trading). Other pool types remain subgraph-enriched.
 *
 * @param {string} proposalAddress
 * @param {number} chainId
 * @returns {Promise<Object|null>} same shape as fetchProposalFromSubgraph
 */
export async function fetchProposalFromChain(proposalAddress, chainId) {
    const cfg = CHAIN_CONFIG[chainId];
    const client = getPublicClient(chainId);
    if (!cfg || !client) {
        console.error(`[OnChainFallback] No chain config/client for chain ${chainId}`);
        return null;
    }

    try {
        const proposal = { address: proposalAddress, abi: PROPOSAL_ABI };
        const [marketName, c1, c2, w0, w1, w2, w3] = await Promise.all([
            client.readContract({ ...proposal, functionName: 'marketName' }).catch(() => null),
            client.readContract({ ...proposal, functionName: 'collateralToken1' }).catch(() => null),
            client.readContract({ ...proposal, functionName: 'collateralToken2' }).catch(() => null),
            client.readContract({ ...proposal, functionName: 'wrappedOutcome', args: [0n] }).catch(() => null),
            client.readContract({ ...proposal, functionName: 'wrappedOutcome', args: [1n] }).catch(() => null),
            client.readContract({ ...proposal, functionName: 'wrappedOutcome', args: [2n] }).catch(() => null),
            client.readContract({ ...proposal, functionName: 'wrappedOutcome', args: [3n] }).catch(() => null),
        ]);

        // wrappedOutcome returns (address token, bytes data); take element 0.
        const yesCompanyAddr = Array.isArray(w0) ? w0[0] : w0;
        const noCompanyAddr = Array.isArray(w1) ? w1[0] : w1;
        const yesCurrencyAddr = Array.isArray(w2) ? w2[0] : w2;
        const noCurrencyAddr = Array.isArray(w3) ? w3[0] : w3;

        if (!c1 || !c2 || !yesCompanyAddr || !noCompanyAddr || !yesCurrencyAddr || !noCurrencyAddr) {
            console.warn('[OnChainFallback] Proposal missing expected outcome tokens; not a futarchy proposal?');
            return null;
        }

        // Read base + outcome token symbols (best-effort; default decimals 18).
        const symbolOf = (addr) => client.readContract({ address: addr, abi: ERC20_SYMBOL_ABI, functionName: 'symbol' }).catch(() => null);
        const [companySym, currencySym, yCoSym, nCoSym, yCuSym, nCuSym] = await Promise.all([
            symbolOf(c1), symbolOf(c2), symbolOf(yesCompanyAddr), symbolOf(noCompanyAddr), symbolOf(yesCurrencyAddr), symbolOf(noCurrencyAddr)
        ]);

        // Discover CONDITIONAL pools on the AMM factory (YES: companyYES/currencyYES, NO: companyNO/currencyNO).
        const findPool = async (tokenA, tokenB) => {
            try {
                return await client.readContract({ address: cfg.ammFactory, abi: ALGEBRA_FACTORY_ABI, functionName: 'poolByPair', args: [tokenA, tokenB] });
            } catch {
                // UniV3 (Ethereum): default 1% fee tier used by these markets.
                try {
                    return await client.readContract({ address: cfg.ammFactory, abi: UNIV3_FACTORY_ABI, functionName: 'getPool', args: [tokenA, tokenB, 10000] });
                } catch { return null; }
            }
        };
        const [yesPool, noPool] = await Promise.all([
            findPool(yesCompanyAddr, yesCurrencyAddr),
            findPool(noCompanyAddr, noCurrencyAddr),
        ]);

        const pools = [];
        if (yesPool && yesPool !== ZERO_ADDR) pools.push({ id: yesPool.toLowerCase(), name: 'CONDITIONAL_YES', type: 'CONDITIONAL', outcomeSide: 'YES', price: null });
        if (noPool && noPool !== ZERO_ADDR) pools.push({ id: noPool.toLowerCase(), name: 'CONDITIONAL_NO', type: 'CONDITIONAL', outcomeSide: 'NO', price: null });

        const companySymbol = companySym || 'COMPANY';
        const currencySymbol = currencySym || (chainId === 1 ? 'USDS' : 'sDAI');

        // Outcome-token symbols must match `${PREFIX}_${baseSymbol}` for
        // transformSubgraphToSupabaseFormat's findToken() to pair them.
        const outcomeTokens = [
            { id: yesCompanyAddr.toLowerCase(), symbol: yCoSym || `YES_${companySymbol}`, decimals: 18 },
            { id: noCompanyAddr.toLowerCase(), symbol: nCoSym || `NO_${companySymbol}`, decimals: 18 },
            { id: yesCurrencyAddr.toLowerCase(), symbol: yCuSym || `YES_${currencySymbol}`, decimals: 18 },
            { id: noCurrencyAddr.toLowerCase(), symbol: nCuSym || `NO_${currencySymbol}`, decimals: 18 },
        ];

        console.log(`[OnChainFallback] Assembled config for ${proposalAddress} (${pools.length} conditional pools found on-chain)`);

        return {
            id: proposalAddress.toLowerCase(),
            marketName: marketName || '',
            companyToken: { id: c1.toLowerCase(), symbol: companySymbol, decimals: 18 },
            currencyToken: { id: c2.toLowerCase(), symbol: currencySymbol, decimals: 18 },
            outcomeTokens,
            pools,
            _fromChain: true,
        };
    } catch (error) {
        console.error('[OnChainFallback] Error:', error);
        return null;
    }
}

/**
 * Fetch proposal data from the candles indexer.
 *
 * Three top-level lookups batched into one request, assembled into the
 * shape that matches what
 * `transformSubgraphToSupabaseFormat` expects.
 *
 * @param {string} proposalAddress - The proposal contract address (plain)
 * @param {number} chainId - The chain ID (1 or 100)
 * @returns {Promise<Object|null>} - Assembled proposal data
 */
export async function fetchProposalFromSubgraph(proposalAddress, chainId) {
    if (!SUBGRAPH_ENDPOINTS[chainId]) {
        console.error(`[SubgraphAdapter] No endpoint for chain ${chainId}`);
        return null;
    }

    console.log(`[SubgraphAdapter] Fetching from chain ${chainId}: ${proposalAddress.toLowerCase()}`);

    // One shared request per proposal, also serving usePoolData — see
    // services/proposalMarketData.js.
    const data = await fetchProposalMarketData(chainId, proposalAddress);

    const proposal = data?.proposal;
    if (!proposal) return null;

    const wls = data.whitelistedTokens;
    const pools = data.pools;

    // Derive the underlying COMPANY/CURRENCY symbol by stripping the
    // YES_/NO_ prefix from the corresponding outcome-token symbol.
    // role values: "YES_COMPANY" | "NO_COMPANY" | "YES_CURRENCY" | "NO_CURRENCY"
    const findRole = role => wls.find(t => t.role === role);
    const yesCompany = findRole('YES_COMPANY');
    const noCompany = findRole('NO_COMPANY');
    const yesCurrency = findRole('YES_CURRENCY');
    const noCurrency = findRole('NO_CURRENCY');

    const stripPrefix = (sym) => {
        if (!sym) return null;
        return sym.replace(/^(YES|NO)_/i, '') || null;
    };

    const companySymbol  = stripPrefix(yesCompany?.symbol)  || stripPrefix(noCompany?.symbol);
    const currencySymbol = stripPrefix(yesCurrency?.symbol) || stripPrefix(noCurrency?.symbol);

    const companyAddr  = proposal.companyToken?.id ?? null;
    const currencyAddr = proposal.currencyToken?.id ?? null;

    // Default decimals to 18 (true for all current tokens; if a future token
    // differs we'll add an on-chain fallback). Outcome tokens carry their own.
    const decimalsDefault = yesCompany?.decimals ?? 18;

    const outcomeTokens = wls.map(t => ({
        id: t.id,
        symbol: t.symbol,
        decimals: t.decimals,
    }));

    return {
        id: proposal.id,
        marketName: proposal.marketName,
        companyToken: companySymbol
            ? { id: companyAddr, symbol: companySymbol, decimals: decimalsDefault }
            : null,
        currencyToken: currencySymbol
            ? { id: currencyAddr, symbol: currencySymbol, decimals: decimalsDefault }
            : null,
        outcomeTokens,
        pools: pools.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            outcomeSide: p.outcomeSide,
            price: p.price,
        })),
    };
}

/**
 * Transform subgraph data to Supabase market_event format
 * @param {Object} subgraphData - Raw data from subgraph
 * @param {string} proposalAddress - The original proposal address (for casing)
 * @param {number} chainId - The chain ID
 * @returns {Object} - Data in Supabase market_event format
 */
export function transformSubgraphToSupabaseFormat(subgraphData, proposalAddress, chainId) {
    if (!subgraphData) {
        return null;
    }

    const config = CHAIN_CONFIG[chainId];
    const { marketName, companyToken, currencyToken, outcomeTokens, pools } = subgraphData;

    // Find outcome tokens by matching with base token symbols
    // Handle various naming conventions (YES_GNO, YES_sDAI, etc.)
    const findToken = (prefix, baseSymbol) => {
        if (!outcomeTokens || !baseSymbol) return null;
        return outcomeTokens.find(t =>
            t.symbol === `${prefix}_${baseSymbol}` ||
            t.symbol.toLowerCase() === `${prefix.toLowerCase()}_${baseSymbol.toLowerCase()}`
        );
    };

    const yesCompany = findToken('YES', companyToken?.symbol);
    const noCompany = findToken('NO', companyToken?.symbol);
    const yesCurrency = findToken('YES', currencyToken?.symbol);
    const noCurrency = findToken('NO', currencyToken?.symbol);

    // Find pools by type and outcome side
    const findPool = (type, side) => {
        if (!pools) return null;
        return pools.find(p =>
            p.type === type &&
            p.outcomeSide?.toUpperCase() === side.toUpperCase()
        );
    };

    const conditionalYes = findPool('CONDITIONAL', 'YES');
    const conditionalNo = findPool('CONDITIONAL', 'NO');
    const predictionYes = findPool('PREDICTION', 'YES');
    const predictionNo = findPool('PREDICTION', 'NO');
    const evYes = findPool('EXPECTED_VALUE', 'YES');
    const evNo = findPool('EXPECTED_VALUE', 'NO');

    // Build the Supabase-compatible format
    return {
        id: proposalAddress, // Keep original casing
        title: marketName,
        type: 'proposal',
        proposal_markdown: marketName,

        // This is the key: metadata in exact Supabase format
        metadata: {
            chain: chainId,
            title: marketName,
            marketName: marketName,

            // Contract infos (for router, conditional tokens, etc.)
            contractInfos: {
                conditionalTokens: config.conditionalTokens,
                wrapperService: config.wrapperService,
                futarchy: {
                    router: config.routerAddress
                },
                sushiswap: {
                    routerV2: '0xf2614A233c7C3e7f08b1F887Ba133a13f1eb2c55',
                    routerV3: '0x592abc3734cd0d458e6e44a2db2992a3d00283a4',
                    factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'
                }
            },

            // Token configurations
            companyTokens: {
                base: companyToken ? {
                    tokenName: companyToken.symbol,
                    tokenSymbol: companyToken.symbol,
                    wrappedCollateralTokenAddress: companyToken.id
                } : null,
                yes: yesCompany ? {
                    tokenName: yesCompany.symbol,
                    tokenSymbol: yesCompany.symbol,
                    wrappedCollateralTokenAddress: yesCompany.id
                } : null,
                no: noCompany ? {
                    tokenName: noCompany.symbol,
                    tokenSymbol: noCompany.symbol,
                    wrappedCollateralTokenAddress: noCompany.id
                } : null
            },

            currencyTokens: {
                base: currencyToken ? {
                    tokenName: currencyToken.symbol,
                    tokenSymbol: currencyToken.symbol,
                    wrappedCollateralTokenAddress: currencyToken.id
                } : null,
                yes: yesCurrency ? {
                    tokenName: yesCurrency.symbol,
                    tokenSymbol: yesCurrency.symbol,
                    wrappedCollateralTokenAddress: yesCurrency.id
                } : null,
                no: noCurrency ? {
                    tokenName: noCurrency.symbol,
                    tokenSymbol: noCurrency.symbol,
                    wrappedCollateralTokenAddress: noCurrency.id
                } : null
            },

            // Pool configurations
            conditional_pools: {
                yes: conditionalYes ? {
                    address: conditionalYes.id,
                    tokenCompanySlot: 1 // Default, may need to be computed
                } : null,
                no: conditionalNo ? {
                    address: conditionalNo.id,
                    tokenCompanySlot: 0
                } : null
            },

            prediction_pools: {
                yes: predictionYes ? {
                    address: predictionYes.id,
                    tokenBaseSlot: 0
                } : null,
                no: predictionNo ? {
                    address: predictionNo.id,
                    tokenBaseSlot: 0
                } : null
            },

            expected_value_pools: {
                yes: evYes ? { address: evYes.id } : null,
                no: evNo ? { address: evNo.id } : null
            },

            // Contract addresses
            factoryAddress: config.factoryAddress,
            routerAddress: config.routerAddress,
            futarchyAdapter: config.futarchyAdapter,
            proposalAddress: proposalAddress,

            // Source indicator
            _source: 'subgraph',
            _chainId: chainId
        },

        // Standard fields
        event_status: 'open',
        visibility: 'public',
        resolution_status: null,  // Not available from market subgraph; useContractConfig falls back to _registryMetadata
        resolution_outcome: null,
        expiration_time: null
    };
}

/**
 * Parse the useContractSource query parameter
 * @param {string} sourceParam - e.g., "subgraph-1" or "subgraph-100"
 * @returns {{ type: 'supabase' | 'subgraph', chainId?: number }}
 */
export function parseContractSource(sourceParam) {
    if (!sourceParam) {
        return { type: 'supabase' };
    }

    const match = sourceParam.match(/^subgraph-(\d+)$/);
    if (match) {
        const chainId = parseInt(match[1], 10);
        if (SUBGRAPH_ENDPOINTS[chainId]) {
            return { type: 'subgraph', chainId };
        }
    }

    return { type: 'supabase' };
}

/**
 * Main function: Fetch market event data from either Supabase or Subgraph
 * based on the useContractSource parameter
 * 
 * @param {string} proposalId - The proposal address
 * @param {string|null} sourceParam - The useContractSource query param value
 * @returns {Promise<Object>} - Market event data in Supabase format
 */
export async function fetchMarketEventData(proposalId, sourceParam = null) {
    const source = parseContractSource(sourceParam);

    console.log(`[SubgraphAdapter] Source: ${source.type}, Chain: ${source.chainId || 'N/A'}`);

    if (source.type === 'subgraph') {
        const subgraphData = await fetchProposalFromSubgraph(proposalId, source.chainId);

        if (subgraphData) {
            return transformSubgraphToSupabaseFormat(subgraphData, proposalId, source.chainId);
        }

        // On-chain fallback: the candles subgraph has not indexed this proposal
        // yet (common for freshly-created markets, or during indexer lag/outage).
        // Derive tokens + conditional pools directly from the proposal contract
        // so the market page works immediately instead of failing with "not found".
        console.warn(`[SubgraphAdapter] Proposal not in subgraph, trying on-chain fallback...`);
        const chainData = await fetchProposalFromChain(proposalId, source.chainId);
        if (chainData) {
            console.log(`[SubgraphAdapter] ✅ Built config from chain for ${proposalId}`);
            return transformSubgraphToSupabaseFormat(chainData, proposalId, source.chainId);
        }

        console.warn(`[SubgraphAdapter] On-chain fallback failed, returning null`);
        return null;
    }

    // For 'supabase' type, return null to indicate Supabase should be used
    return null;
}

export default {
    fetchProposalFromSubgraph,
    transformSubgraphToSupabaseFormat,
    parseContractSource,
    fetchMarketEventData,
    SUBGRAPH_ENDPOINTS
};
