import { useCallback, useEffect, useState } from 'react';
import { getRpcProvider } from '../../../../utils/getBestRpc';
import { fetchOnChainResolutions, resolutionKey } from '../../../../utils/onChainResolution';
import { fetchOutcomeBalances, fetchProposalOutcomes } from '../../../../utils/proposalOutcomes';

/**
 * A categorical proposal's outcomes, resolution and the account's balances.
 * For a binary proposal isCategorical is false and the page keeps its YES/NO
 * panels; while the proposal is read it is false too.
 */
export function useCategoricalMarket(config, address) {
  const proposalAddress = config?.MARKET_ADDRESS;
  const chainId = Number(config?.chainId) || 100;
  const conditionalTokens = config?.CONDITIONAL_TOKENS_ADDRESS;

  const [proposal, setProposal] = useState(null);
  const [resolution, setResolution] = useState(null);
  const [balances, setBalances] = useState(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState(null);
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

  return { isCategorical, proposal, resolution, balances, isLoadingBalances, balanceError, refetch };
}
