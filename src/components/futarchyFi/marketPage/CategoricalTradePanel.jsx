import { useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useAtomicBatch } from '../../../hooks/useAtomicBatch';
import { useRequiredChain } from '../../../hooks/useChainValidation';
import { useSafeConnection } from '../../../hooks/useSafeConnection';
import { tradeOutcome } from '../../../utils/outcomeTrade';
import { formatWith } from '../../../utils/precisionFormatter';
import { CATEGORICAL_ROUTER_BY_CHAIN } from '../../../utils/proposalOutcomes';
import { describeRedeemError } from '../../../utils/redeemPlan';
import { quoteSeerSwap } from '../../../utils/seerSwap';
import { describeQuoteError } from '../../../utils/txErrors';

// Outcome tokens are wrapped with 18 decimals by both futarchy factories.
const DECIMALS = 18;
const SLIPPAGE_OPTIONS_BPS = [50, 100, 300];

// Four significant digits: a company token can be worth 0.02 of the currency.
const formatPrice = (value) => String(Number(value.toPrecision(4)));
const format = (raw) => formatWith(Number(formatUnits(raw ?? 0n, DECIMALS)), 'balance');

const parseAmount = (value) => {
  try {
    const raw = parseUnits(String(value).trim(), DECIMALS);
    return raw > 0n ? raw : null;
  } catch {
    return null;
  }
};

const pill = (active) => `px-3 py-1 rounded-full text-xs font-semibold transition-colors ${active
  ? 'bg-futarchyGray12 text-white dark:bg-white dark:text-black'
  : 'bg-futarchyGray4 dark:bg-futarchyDarkGray42 text-futarchyGray11 dark:text-white/80 hover:bg-futarchyGray5 dark:hover:bg-futarchyGray6'}`;

const buttonClass = 'w-full py-3 px-4 rounded-xl font-semibold text-sm border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 text-black dark:text-white disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Trades in the conditional pool of one answer of a categorical proposal:
 * buy that answer's company token with its currency token, or sell it. The
 * shortfall of the token spent is split from the collateral first.
 */
const CategoricalTradePanel = ({ categorical, config, address, selectedKey, onSelect, onConnectWallet }) => {
  const { proposal, pools, balances, resolution, refetch } = categorical;
  const chainId = Number(config?.chainId) || 100;
  const router = CATEGORICAL_ROUTER_BY_CHAIN[chainId];

  // `address` is the page's account (the connected wallet, or ?debugAddress);
  // trades are signed by the connected wallet.
  const { address: account } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const isSafeConnection = useSafeConnection();
  const batch = useAtomicBatch();
  const requiredChain = useRequiredChain(config?.chainId);

  const [action, setAction] = useState('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(SLIPPAGE_OPTIONS_BPS[0]);
  const [quote, setQuote] = useState({ trade: null, quotedAt: 0, loading: false, error: null });
  const [status, setStatus] = useState({ busy: false, message: null, error: null });

  const row = pools?.find((pool) => pool.key === selectedKey) ?? pools?.[0] ?? null;
  const isBuy = action === 'buy';
  const tokenIn = row && (isBuy ? row.currency : row.company);
  const tokenOut = row && (isBuy ? row.company : row.currency);
  const collateral = isBuy ? proposal.currencyToken : proposal.companyToken;
  const collateralSymbol = (isBuy ? config?.BASE_TOKENS_CONFIG?.currency?.symbol : config?.BASE_TOKENS_CONFIG?.company?.symbol)
    || (isBuy ? proposal.invalid.currency.name : proposal.invalid.company.name)?.replace(/^INVALID_/, '');
  const balanceOf = (token) => balances?.get(token.toLowerCase()) ?? 0n;

  const amountRaw = parseAmount(amount);
  const held = tokenIn ? balanceOf(tokenIn.address) : 0n;
  const maxAmount = held + balanceOf(collateral);
  const split = amountRaw !== null && amountRaw > held ? amountRaw - held : 0n;

  useEffect(() => {
    setQuote({ trade: null, quotedAt: 0, loading: false, error: null });
    if (!row?.conditional || amountRaw === null) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      setQuote((previous) => ({ ...previous, loading: true }));
      quoteSeerSwap({ chainId, account: address, tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountInRaw: amountRaw, slippageBps })
        .then((trade) => { if (!cancelled) setQuote({ trade, quotedAt: Date.now(), loading: false, error: null }); })
        .catch((error) => { if (!cancelled) setQuote({ trade: null, quotedAt: 0, loading: false, error: describeQuoteError(error) }); });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
    // amountRaw is a new bigint on every render; amount is the stable input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.key, row?.conditional?.address, action, amount, slippageBps, chainId, address]);

  if (resolution?.resolved) return null;

  // Price of the company token in currency tokens, both for buys and sells.
  const tradePrice = quote.trade && amountRaw
    ? (isBuy
      ? Number(formatUnits(amountRaw, DECIMALS)) / Number(formatUnits(quote.trade.amountOut, DECIMALS))
      : Number(formatUnits(quote.trade.amountOut, DECIMALS)) / Number(formatUnits(amountRaw, DECIMALS)))
    : null;
  const poolPrice = row?.conditional?.price ?? null;
  const impact = tradePrice !== null && poolPrice ? Math.abs(tradePrice - poolPrice) / poolPrice : null;

  const blocker = !row ? null
    : !row.conditional ? `${row.label} has no ${row.company.name} / ${row.currency.name} pool yet.`
      : split > 0n && !router ? 'Splitting is not available: the categorical futarchy router is not deployed on this chain yet.'
        : null;
  const canTrade = !blocker && !status.busy && quote.trade && !quote.loading && amountRaw !== null && amountRaw <= maxAmount;

  const handleTrade = async () => {
    if (!walletClient || !account) {
      onConnectWallet?.();
      return;
    }
    if (requiredChain.isWrongChain) {
      setStatus({ busy: false, message: null, error: `This market is on ${requiredChain.requiredChainName}. Switch your wallet to it to continue.` });
      return;
    }
    const label = `${isBuy ? 'Buy' : 'Sell'} ${row.company.name}`;
    const report = (message) => setStatus({ busy: true, message, error: null });
    report(`${label}…`);
    try {
      await tradeOutcome({
        publicClient, walletClient, account, router, proposal: config.MARKET_ADDRESS,
        collateralToken: collateral, collateralSymbol,
        tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: amountRaw,
        trade: quote.trade, quotedAt: quote.quotedAt, slippageBps,
        isSafe: isSafeConnection(walletClient),
        batch,
        onStep: (step) => {
          if (step === 'batch') report(`${split > 0n ? `Splitting ${collateralSymbol} and swapping` : 'Swapping'} ${tokenIn.name} for ${tokenOut.name} in one transaction…`);
          if (step === 'split') report(`Splitting ${format(split)} ${collateralSymbol} into outcome tokens…`);
          if (step === 'approval') report(`Approving ${tokenIn.name}…`);
          if (step === 'swap') report(`Swapping ${tokenIn.name} for ${tokenOut.name}…`);
        },
      });
      setStatus({ busy: false, message: `${label} done.`, error: null });
      setAmount('');
      refetch();
    } catch (error) {
      setStatus({ busy: false, message: null, error: describeRedeemError(error) });
      refetch();
    }
  };

  return (
    <div className="flex flex-col bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden">
      <div className="flex h-16 py-3 px-4 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70 items-center justify-between">
        <h3 className="text-futarchyGray12 dark:text-white text-sm font-semibold">Trade</h3>
        <div className="flex gap-1">
          <button className={pill(isBuy)} onClick={() => setAction('buy')}>Buy</button>
          <button className={pill(!isBuy)} onClick={() => setAction('sell')}>Sell</button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {!pools ? (
          <p className="py-4 text-center text-sm text-futarchyGray11 dark:text-white/70">Loading pools…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Outcome">
              {pools.map((pool) => (
                <button key={pool.key} className={pill(pool.key === row.key)} onClick={() => onSelect?.(pool.key)}>{pool.label}</button>
              ))}
            </div>

            <p className="text-xs text-futarchyGray11 dark:text-white/70">
              {isBuy
                ? `Spend ${row.currency.name} to buy ${row.company.name}: ${collateralSymbol} you hold is split if needed.`
                : `Sell ${row.company.name} for ${row.currency.name}: ${collateralSymbol} you hold is split if needed.`}
            </p>

            <div className="flex items-center gap-2 rounded-xl border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 px-3 py-2">
              <input
                aria-label={`Amount of ${tokenIn.name} to spend`}
                inputMode="decimal"
                placeholder="0.0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="flex-1 min-w-0 bg-transparent text-sm text-futarchyGray12 dark:text-white outline-none"
              />
              <span className="text-xs text-futarchyGray11 dark:text-white/70">{tokenIn.name}</span>
              {address && (
                <button
                  className="text-xs font-semibold text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white"
                  onClick={() => setAmount(formatUnits(maxAmount, DECIMALS))}
                >
                  Max {format(maxAmount)}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-futarchyGray11 dark:text-white/70">
              <span>Slippage</span>
              <div className="flex gap-1">
                {SLIPPAGE_OPTIONS_BPS.map((bps) => (
                  <button key={bps} className={pill(bps === slippageBps)} onClick={() => setSlippageBps(bps)}>{bps / 100}%</button>
                ))}
              </div>
            </div>

            {blocker ? (
              <p className="text-xs text-futarchyGray11 dark:text-white/70">{blocker}</p>
            ) : amountRaw !== null && (
              <dl className="grid grid-cols-2 gap-y-1 text-xs text-futarchyGray11 dark:text-white/70">
                {quote.loading && !quote.trade ? <dt className="col-span-2">Getting a quote…</dt> : quote.error ? (
                  <dt className="col-span-2 text-futarchyCrimson11">{quote.error}</dt>
                ) : quote.trade && (
                  <>
                    <dt>You receive</dt>
                    <dd className="text-right tabular-nums text-futarchyGray12 dark:text-white">{format(quote.trade.amountOut)} {tokenOut.name}</dd>
                    <dt>Minimum</dt>
                    <dd className="text-right tabular-nums">{format(quote.trade.minimumAmountOut())} {tokenOut.name}</dd>
                    <dt>Price</dt>
                    <dd className="text-right tabular-nums">{formatPrice(tradePrice)} {row.currency.name} per {row.company.name}</dd>
                    {impact !== null && (
                      <>
                        <dt>Price impact</dt>
                        <dd className={`text-right tabular-nums ${impact > 0.05 ? 'text-futarchyCrimson11' : ''}`}>{(impact * 100).toFixed(2)}%</dd>
                      </>
                    )}
                  </>
                )}
                {split > 0n && (
                  <dt className="col-span-2 pt-1">
                    Splits {format(split)} {collateralSymbol} first. You keep the other answers&apos; and the Invalid tokens it gives.
                  </dt>
                )}
                {amountRaw > maxAmount && address && <dt className="col-span-2 pt-1 text-futarchyCrimson11">Not enough {tokenIn.name} or {collateralSymbol}.</dt>}
              </dl>
            )}

            <button className={buttonClass} disabled={!!address && !canTrade} onClick={handleTrade}>
              {!address ? 'Connect Wallet' : `${isBuy ? 'Buy' : 'Sell'} ${row.company.name}`}
            </button>

            {(status.message || status.error) && (
              <p role="status" className={`text-xs ${status.error ? 'text-futarchyCrimson11' : 'text-futarchyGray11 dark:text-white/70'}`}>
                {status.error || status.message}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CategoricalTradePanel;
