import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRpcProvider } from '../../../../utils/getBestRpc';
import { fetchOnChainResolutions, resolutionKey } from '../../../../utils/onChainResolution';
import { categoricalTotals } from '../../../../utils/proposalOutcomes';
import { familyNodes, familyResolution, fetchFamilyBalances, fetchFamilyPools, fetchProposalFamily } from '../../../../utils/proposalFamily';
import { fetchProposalMarketData } from '../../../../services/proposalMarketData';
import { fetchChainedProposalsFromRegistry } from '../../../../adapters/registryAdapter';
import { getRealityQuestionUrl } from '../../../debug/constants/chainConfig';

const POOL_REFRESH_MS = 30_000;
const FAMILY_RETRY_MS = 10_000;

/**
 * A categorical proposal's outcomes, their pools, resolution and the
 * account's balances. The proposal is read with every proposal chained to
 * its answers (utils/proposalFamily.js), so a question continued by later
 * questions shows as one market:
 *   - proposal: the root proposal; family: the whole tree;
 *   - pools: the answers the market shows (familyLeaves) with their pools and
 *     chance; allPools: every answer of every proposal, for the liquidity
 *     screens;
 *   - resolution: familyResolution, resolved once a leaf or INVALID won.
 * For a binary proposal isCategorical is false and the page keeps its YES/NO
 * panels; while the proposal is read it is false too. Once the proposal is
 * known to be categorical but its family is not read yet, isCategoricalPending
 * is true, with familyError when the last read failed (it is retried), so the
 * page shows neither the YES/NO panels nor a partial family.
 */
export function useCategoricalMarket(config, address) {
  const proposalAddress = config?.MARKET_ADDRESS;
  const chainId = Number(config?.chainId) || 100;
  const conditionalTokens = config?.CONDITIONAL_TOKENS_ADDRESS;

  const [family, setFamily] = useState(null);
  const [resolutions, setResolutions] = useState(null);
  const [familyPools, setFamilyPools] = useState(null);
  const [balances, setBalances] = useState(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState(null);
  const [volumeByPool, setVolumeByPool] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // A failed read (RPC, or the registry's chainedProposals) leaves no family
  // rather than a partial one, and is tried again after FAMILY_RETRY_MS.
  const [familyAttempt, setFamilyAttempt] = useState(0);
  const [knownCategorical, setKnownCategorical] = useState(false);
  const [familyError, setFamilyError] = useState(null);
  useEffect(() => {
    setKnownCategorical(false);
    setFamilyError(null);
  }, [proposalAddress, chainId]);
  useEffect(() => {
    setFamily(null);
    if (!proposalAddress) return undefined;
    let cancelled = false;
    let retry = null;
    fetchProposalFamily(proposalAddress, getRpcProvider(chainId), {
      chainId,
      conditionalTokens,
      listChained: fetchChainedProposalsFromRegistry,
      onCategorical: () => { if (!cancelled) setKnownCategorical(true); },
    })
      .then((result) => {
        if (cancelled) return;
        setFamily(result);
        setFamilyError(null);
      })
      .catch((error) => {
        console.warn('[useCategoricalMarket] Could not read the proposal outcomes:', error?.message);
        if (cancelled) return;
        setFamilyError(error?.message || 'Unknown error');
        retry = setTimeout(() => setFamilyAttempt((n) => n + 1), FAMILY_RETRY_MS);
      });
    return () => { cancelled = true; clearTimeout(retry); };
  }, [proposalAddress, chainId, conditionalTokens, familyAttempt]);
  const retryFamily = useCallback(() => setFamilyAttempt((n) => n + 1), []);

  const proposal = family?.root.proposal ?? null;
  const isCategorical = proposal?.kind === 'categorical';
  const nodes = useMemo(() => (family ? familyNodes(family) : []), [family]);

  useEffect(() => {
    if (!isCategorical) return undefined;
    let cancelled = false;
    fetchOnChainResolutions(nodes.map((node) => ({ proposalAddress: node.proposal.address, chainId, conditionalTokens })))
      .then((results) => { if (!cancelled) setResolutions(results); });
    return () => { cancelled = true; };
  }, [isCategorical, nodes, chainId, conditionalTokens, refreshKey]);

  useEffect(() => {
    if (!isCategorical) return undefined;
    let cancelled = false;
    fetchFamilyPools(family, getRpcProvider(chainId), { chainId })
      .then((result) => { if (!cancelled) setFamilyPools(result); })
      .catch((error) => console.warn('[useCategoricalMarket] Could not read the outcome pools:', error?.message));
    return () => { cancelled = true; };
  }, [isCategorical, family, chainId, refreshKey]);

  // Traded volume is only in the candles indexer: per pool, the side in the
  // answer's currency token. Pool IDs may carry a chain prefix ("100-0x…").
  useEffect(() => {
    if (!isCategorical) return undefined;
    let cancelled = false;
    Promise.all(nodes.map((node) => fetchProposalMarketData(chainId, node.proposal.address)))
      .then((results) => {
        if (cancelled) return;
        setVolumeByPool(new Map(results.filter(Boolean).flatMap((data) => data.pools).map((pool) => [
          pool.id.replace(/^\d+-/, '').toLowerCase(),
          parseFloat(pool.token0?.role === 'ANSWER_CURRENCY' ? pool.volumeToken0 : pool.volumeToken1) || 0,
        ])));
      })
      .catch((error) => console.warn('[useCategoricalMarket] Could not read the pool volumes:', error?.message));
    return () => { cancelled = true; };
  }, [isCategorical, nodes, chainId]);

  const pools = familyPools?.leaves ?? null;
  const totals = useMemo(() => (pools ? categoricalTotals(pools, volumeByPool) : null), [pools, volumeByPool]);
  const resolution = useMemo(() => (family && resolutions
    ? familyResolution(family, (node) => resolutions.get(resolutionKey(chainId, node.proposal.address)) ?? null)
    : null), [family, resolutions, chainId]);

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
    fetchFamilyBalances(family, address, getRpcProvider(chainId))
      .then((result) => {
        if (cancelled) return;
        setBalances(result);
        setBalanceError(null);
      })
      .catch((error) => { if (!cancelled) setBalanceError(error?.message || 'RPC connection failed'); })
      .finally(() => { if (!cancelled) setIsLoadingBalances(false); });
    return () => { cancelled = true; };
  }, [isCategorical, family, address, chainId, refreshKey]);

  const refetch = useCallback(() => setRefreshKey((key) => key + 1), []);

  // The Reality question of every follow-up proposal, after the root's (the
  // page's own question link): each is answered on its own. label lists the
  // question's answers, which tell the questions apart.
  const [followUpQuestionLinks, setFollowUpQuestionLinks] = useState([]);
  useEffect(() => {
    setFollowUpQuestionLinks([]);
    if (nodes.length < 2) return undefined;
    let cancelled = false;
    Promise.all(nodes.slice(1).map((node) => getRealityQuestionUrl(chainId, node.proposal.address)))
      .then((links) => {
        if (cancelled) return;
        setFollowUpQuestionLinks(nodes.slice(1)
          .map((node, i) => ({ label: node.proposal.outcomes.map((outcome) => outcome.label).join(', '), link: links[i] }))
          .filter(({ link }) => link));
      });
    return () => { cancelled = true; };
  }, [nodes, chainId]);

  return {
    isCategorical,
    followUpQuestionLinks,
    isCategoricalPending: knownCategorical && !family,
    familyError: knownCategorical && !family ? familyError : null,
    retryFamily,
    proposal,
    family,
    pools,
    allPools: familyPools?.all ?? null,
    totals,
    resolution,
    balances,
    isLoadingBalances,
    balanceError,
    refetch,
  };
}
