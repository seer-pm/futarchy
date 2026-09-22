import { getSubgraphEndpoint } from '../config/subgraphEndpoints';

export const MIN_ACTIVE_MARKET_LIQUIDITY_USD = 1_000;

const DEFAULT_RPC_URLS = {
  1: process.env.NEXT_PUBLIC_MAINNET_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  100: process.env.NEXT_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com',
};

const BALANCE_OF_SELECTOR = '70a08231';

const normalizeAddress = (value) => {
  const text = String(value || '').toLowerCase();
  return text.includes('-') ? text.split('-').at(-1) : text;
};

const chainAddressKey = (chainId, value) => `${Number(chainId)}:${normalizeAddress(value)}`;

const toHumanNumber = (rawValue, decimals) => {
  let raw;
  try {
    raw = typeof rawValue === 'bigint' ? rawValue : BigInt(rawValue);
  } catch (_) {
    return null;
  }

  const safeDecimals = Number(decimals);
  if (!Number.isInteger(safeDecimals) || safeDecimals < 0 || safeDecimals > 36) return null;

  const divisor = 10n ** BigInt(safeDecimals);
  const whole = raw / divisor;
  const fractional = (raw % divisor).toString().padStart(safeDecimals, '0').slice(0, 12);
  const value = Number(whole) + (fractional ? Number(`0.${fractional}`) : 0);
  return Number.isFinite(value) ? value : null;
};

const isCurrencyToken = (token) => {
  const role = String(token?.role || '').toUpperCase();
  return role.includes('CURRENCY') || role.includes('COLLATERAL');
};

/**
 * Value a conditional pool from its real ERC-20 reserves, not virtual V3/Algebra L.
 * Currency wrappers (sDAI/USDS/etc.) are treated as the one-dollar numeraire.
 */
export function calculatePoolLiquidityUsd(pool, tokensByAddress, balancesByTokenAndPool) {
  if (!pool) return null;

  const chainId = Number(pool.chainId);
  const hasChainId = Number.isFinite(chainId);
  const token0Address = normalizeAddress(pool.token0?.id);
  const token1Address = normalizeAddress(pool.token1?.id);
  const poolAddress = normalizeAddress(pool.id);
  const token0 = (hasChainId && tokensByAddress.get(chainAddressKey(chainId, token0Address)))
    || tokensByAddress.get(token0Address);
  const token1 = (hasChainId && tokensByAddress.get(chainAddressKey(chainId, token1Address)))
    || tokensByAddress.get(token1Address);

  if (!token0 || !token1 || isCurrencyToken(token0) === isCurrencyToken(token1)) return null;

  const raw0 = (hasChainId
    ? balancesByTokenAndPool.get(`${chainId}:${token0Address}:${poolAddress}`)
    : undefined) ?? balancesByTokenAndPool.get(`${token0Address}:${poolAddress}`);
  const raw1 = (hasChainId
    ? balancesByTokenAndPool.get(`${chainId}:${token1Address}:${poolAddress}`)
    : undefined) ?? balancesByTokenAndPool.get(`${token1Address}:${poolAddress}`);
  const amount0 = toHumanNumber(raw0, token0.decimals);
  const amount1 = toHumanNumber(raw1, token1.decimals);
  const tick = Number(pool.tick);

  if (amount0 === null || amount1 === null || !Number.isFinite(tick)) return null;

  // Algebra tick is raw token1/token0. Correct for token decimal differences
  // before using it to value the company-token reserve in currency units.
  const token1PerToken0 = Math.exp(Math.log(1.0001) * tick)
    * Math.pow(10, Number(token0.decimals) - Number(token1.decimals));
  if (!Number.isFinite(token1PerToken0) || token1PerToken0 <= 0) return null;

  const currencyIsToken0 = isCurrencyToken(token0);
  const currencyAmount = currencyIsToken0 ? amount0 : amount1;
  const companyAmount = currencyIsToken0 ? amount1 : amount0;
  const currencyPerCompany = currencyIsToken0 ? 1 / token1PerToken0 : token1PerToken0;
  const total = currencyAmount + companyAmount * currencyPerCompany;

  return Number.isFinite(total) && total >= 0 ? total : null;
}

const balanceOfCalldata = (poolAddress) => (
  `0x${BALANCE_OF_SELECTOR}${normalizeAddress(poolAddress).replace(/^0x/, '').padStart(64, '0')}`
);

async function fetchIndexedPools(events, fetchImpl) {
  const idsByChain = new Map();

  for (const event of events) {
    const chainId = Number(event.chainId || event.metadata?.chain || 100);
    if (!idsByChain.has(chainId)) {
      idsByChain.set(chainId, { poolIds: [], proposalIds: [] });
    }
    const ids = idsByChain.get(chainId);
    const proposalAddress = normalizeAddress(event.proposalAddress || event.eventId);
    if (proposalAddress) ids.proposalIds.push(proposalAddress);
    for (const address of [event.poolAddresses?.yes, event.poolAddresses?.no]) {
      if (address) ids.poolIds.push(normalizeAddress(address));
    }
  }

  if (idsByChain.size === 0) {
    return { pools: [], tokens: [] };
  }

  // `first` is capped at 1000 per selection. At 4 outcome tokens per proposal
  // that covers 250 proposals; beyond that the tail is truncated, its pools
  // fail the token lookup below and those markets are hidden rather than
  // mispriced — the same fail-closed direction as an index outage, but silent.
  const query = `
    query ActiveMarketLiquidity($poolIds: [String!]!, $proposalIds: [String!]!) {
      pools(where: { id_in: $poolIds }, first: 1000) {
        id proposal { id } type outcomeSide token0 { id } token1 { id } tick
      }
      whitelistedTokens(where: { proposal_in: $proposalIds }, first: 1000) {
        id proposal { id } decimals role symbol
      }
    }
  `;

  const results = await Promise.all([...idsByChain.entries()].map(async ([chainId, ids]) => {
    if (ids.poolIds.length === 0 || ids.proposalIds.length === 0) {
      return { pools: [], tokens: [] };
    }

    const endpoint = getSubgraphEndpoint(chainId);
    if (!endpoint) {
      console.warn(`[Active Milestones] No liquidity index configured for chain ${chainId}`);
      return { pools: [], tokens: [] };
    }

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: {
            poolIds: [...new Set(ids.poolIds)],
            proposalIds: [...new Set(ids.proposalIds)],
          },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.errors?.length) throw new Error(result.errors[0]?.message || 'GraphQL query failed');
      return {
        pools: (result.data?.pools || []).map((pool) => ({ ...pool, chainId })),
        tokens: (result.data?.whitelistedTokens || []).map((token) => ({ ...token, chainId })),
      };
    } catch (error) {
      // Fail closed only for the affected chain. A Gnosis index outage must not
      // hide independently verified Ethereum markets, or vice versa.
      console.warn(`[Active Milestones] Chain ${chainId} liquidity index failed: ${error.message}`);
      return { pools: [], tokens: [] };
    }
  }));

  return {
    pools: results.flatMap((result) => result.pools),
    tokens: results.flatMap((result) => result.tokens),
  };
}

async function fetchReserveBalances(pools, fetchImpl, rpcUrls) {
  const callsByChain = new Map();
  let nextId = 1;
  for (const pool of pools) {
    if (String(pool.type || '').toUpperCase() !== 'CONDITIONAL') continue;
    const poolAddress = normalizeAddress(pool.id);
    const chainId = Number(pool.chainId);
    if (!Number.isFinite(chainId)) continue;
    if (!callsByChain.has(chainId)) callsByChain.set(chainId, []);

    for (const token of [pool.token0, pool.token1]) {
      const tokenAddress = normalizeAddress(token?.id);
      callsByChain.get(chainId).push({
        id: nextId++,
        key: `${chainId}:${tokenAddress}:${poolAddress}`,
        request: {
          jsonrpc: '2.0',
          id: nextId - 1,
          method: 'eth_call',
          params: [{ to: tokenAddress, data: balanceOfCalldata(poolAddress) }, 'latest'],
        },
      });
    }
  }

  const balances = new Map();
  await Promise.all([...callsByChain.entries()].map(async ([chainId, calls]) => {
    const rpcUrl = rpcUrls[chainId];
    if (!rpcUrl) return;
    const response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calls.map(({ request }) => request)),
    });
    if (!response.ok) return;
    const results = await response.json();
    if (!Array.isArray(results)) return;
    const resultById = new Map(results.map((item) => [item.id, item]));
    for (const call of calls) {
      const result = resultById.get(call.id);
      if (!result?.result || result.error) continue;
      try {
        balances.set(call.key, BigInt(result.result));
      } catch (_) {
        // Fail closed for this market below.
      }
    }
  }));

  return balances;
}

/**
 * Fail closed: a market appears in Active Milestones only when both
 * conditional pools are indexed and their real reserves prove the floor.
 */
export async function filterEventsByMinimumLiquidity(
  events,
  {
    minimumUsd = MIN_ACTIVE_MARKET_LIQUIDITY_USD,
    fetchImpl = fetch,
    rpcUrls = DEFAULT_RPC_URLS,
  } = {}
) {
  if (!events?.length) return [];

  try {
    const { pools, tokens } = await fetchIndexedPools(events, fetchImpl);
    const poolByAddress = new Map(
      pools.map((pool) => [chainAddressKey(pool.chainId, pool.id), pool])
    );
    const tokensByAddress = new Map(
      tokens.map((token) => [chainAddressKey(token.chainId, token.id), token])
    );
    const balances = await fetchReserveBalances(pools, fetchImpl, rpcUrls);

    return events.filter((event) => {
      const chainId = Number(event.chainId || event.metadata?.chain || 100);
      const yesPool = poolByAddress.get(chainAddressKey(chainId, event.poolAddresses?.yes));
      const noPool = poolByAddress.get(chainAddressKey(chainId, event.poolAddresses?.no));
      const yesUsd = calculatePoolLiquidityUsd(yesPool, tokensByAddress, balances);
      const noUsd = calculatePoolLiquidityUsd(noPool, tokensByAddress, balances);

      if (yesUsd === null || noUsd === null) return false;
      event.liquidityUsd = yesUsd + noUsd;
      return event.liquidityUsd >= minimumUsd;
    });
  } catch (error) {
    console.warn('[Active Milestones] Liquidity gate failed closed:', error.message);
    return [];
  }
}
