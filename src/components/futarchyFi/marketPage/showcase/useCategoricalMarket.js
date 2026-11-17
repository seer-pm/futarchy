import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRpcProvider } from '../../../../utils/getBestRpc';
import { fetchOnChainResolutions, resolutionKey } from '../../../../utils/onChainResolution';
import { categoricalTotals, fetchOutcomeBalances, fetchOutcomePools, fetchProposalOutcomes } from '../../../../utils/proposalOutcomes';
import { fetchProposalMarketData } from '../../../../services/proposalMarketData';

const POOL_REFRESH_MS = 30_000;

/**
 * A categorical proposal's outcomes, their pools, resolution and the
 * account's balances.
 * For a binary proposal isCategorical is false and the page keeps its YES/NO
 * panels; while the proposal is read it is false too.
 */
export function useCategoricalMarket(config, address) {
  const proposalAddress = config?.MARKET_ADDRESS;
  const chainId = Number(config?.chainId) || 100;
  const conditionalTokens = config?.CONDITIONAL_TOKENS_ADDRESS;

  const [proposal, setProposal] = useState(null);
  const [resolution, setResolution] = useState(null);
  const [pools, setPools] = useState(null);
  const [balances, setBalances] = useState(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState(null);
  const [volumeByPool, setVolumeByPool] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setProposal(null);
    if (!proposalAddress) return undefined;
    let cancelled = false;
    fetchProposalOutcomes(proposalAddress, getRpcProvider(chainId), { chainId, conditionalTokens })
      .then((result) => { if (!cancelled) setProposal(result); })
      .catch((error) => console.warn('[useCategoricalMarket] Could not read the proposal outcomes:', error?.message));
    return () => { cancelled = true; };
  }, [proposalAddress, chainId, conditionalTokens]);

  const isCategorical = proposal?.kind === 'categorical';

  useEffect(() => {
    if (!isCategorical) return undefined;
    let cancelled = false;
    fetchOnChainResolutions([{ proposalAddress, chainId, conditionalTokens }])
      .then((results) => {
        if (!cancelled) setResolution(results.get(resolutionKey(chainId, proposalAddress)) ?? null);
      });
    return () => { cancelled = true; };
  }, [isCategorical, proposalAddress, chainId, conditionalTokens, refreshKey]);

  useEffect(() => {
    if (!isCategorical) return undefined;
    let cancelled = false;
    fetchOutcomePools(proposal, getRpcProvider(chainId), { chainId })
      .then((result) => { if (!cancelled) setPools(result); })
      .catch((error) => console.warn('[useCategoricalMarket] Could not read the outcome pools:', error?.message));
    return () => { cancelled = true; };
  }, [isCategorical, proposal, chainId, refreshKey]);

  // Traded volume is only in the candles indexer: per pool, the side in the
  // answer's currency token. Pool IDs may carry a chain prefix ("100-0x…").
  useEffect(() => {
    if (!isCategorical) return undefined;
    let cancelled = false;
    fetchProposalMarketData(chainId, proposalAddress)
      .then((data) => {
        if (cancelled || !data) return;
        setVolumeByPool(new Map(data.pools.map((pool) => [
          pool.id.replace(/^\d+-/, '').toLowerCase(),
          parseFloat(pool.token0?.role === 'ANSWER_CURRENCY' ? pool.volumeToken0 : pool.volumeToken1) || 0,
        ])));
      })
      .catch((error) => console.warn('[useCategoricalMarket] Could not read the pool volumes:', error?.message));
    return () => { cancelled = true; };
  }, [isCategorical, proposalAddress, chainId]);

  const totals = useMemo(() => (pools ? categoricalTotals(pools, volumeByPool) : null), [pools, volumeByPool]);

  // Pool prices move with every trade; re-read them while the page is open.
  useEffect(() => {
    if (!isCategorical) return undefined;
    const timer = setInterval(() => setRefreshKey((key) => key + 1), POOL_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isCategorical]);

  useEffect(() => {
    if (!isCategorical || !address) {
      setBalances(null);
      return undefined;
    }
    let cancelled = false;
    setIsLoadingBalances(true);
    fetchOutcomeBalances(proposal, address, getRpcProvider(chainId))
      .then((result) => {
        if (cancelled) return;
        setBalances(result);
        setBalanceError(null);
      })
      .catch((error) => { if (!cancelled) setBalanceError(error?.message || 'RPC connection failed'); })
      .finally(() => { if (!cancelled) setIsLoadingBalances(false); });
    return () => { cancelled = true; };
  }, [isCategorical, proposal, address, chainId, refreshKey]);

  const refetch = useCallback(() => setRefreshKey((key) => key + 1), []);

  return { isCategorical, proposal, pools, totals, resolution, balances, isLoadingBalances, balanceError, refetch };
}
