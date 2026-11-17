import { useMemo, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import FutarchyCartridge from 'futarchy-sdk/executors/FutarchyCartridge';
import { useAtomicBatch } from '../../../hooks/useAtomicBatch';
import { useRequiredChain } from '../../../hooks/useChainValidation';
import { useSafeConnection } from '../../../hooks/useSafeConnection';
import { mergeOutcomeTokens, splitCollateral } from '../../../utils/collateralActions';
import { formatWith } from '../../../utils/precisionFormatter';
import { CATEGORICAL_ROUTER_BY_CHAIN, mergeableAmount, outcomeRows, winningRow } from '../../../utils/proposalOutcomes';
import { describeRedeemError } from '../../../utils/redeemPlan';

// Outcome tokens are wrapped with 18 decimals by both futarchy factories.
const DECIMALS = 18;

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
 * Positions of a categorical futarchy proposal (N answers plus INVALID):
 * the balance of every outcome token, split and merge over all of them, and
 * redemption of the slot that won. Binary proposals use MarketBalancePanel.
 */
const CategoricalPositionsPanel = ({ categorical, config, address, onConnectWallet }) => {
  const { proposal, resolution, balances, isLoadingBalances, balanceError, refetch } = categorical;
  const chainId = Number(config?.chainId) || 100;
  const router = CATEGORICAL_ROUTER_BY_CHAIN[chainId];

  const { address: account } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const isSafeConnection = useSafeConnection();
  const batch = useAtomicBatch();
  const requiredChain = useRequiredChain(config?.chainId);

  const [action, setAction] = useState('split');
  const [side, setSide] = useState('company');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState({ busy: false, message: null, error: null });

  const rows = useMemo(() => outcomeRows(proposal), [proposal]);
  const winner = winningRow(proposal, resolution);
  const symbols = {
    company: config?.BASE_TOKENS_CONFIG?.company?.symbol || proposal.invalid.company.name?.replace(/^INVALID_/, ''),
    currency: config?.BASE_TOKENS_CONFIG?.currency?.symbol || proposal.invalid.currency.name?.replace(/^INVALID_/, ''),
  };
  const collateral = { company: proposal.companyToken, currency: proposal.currencyToken };
  const balanceOf = (token) => balances?.get(token.toLowerCase()) ?? 0n;
  const mergeable = balances
    ? { company: mergeableAmount(proposal, balances, 'company'), currency: mergeableAmount(proposal, balances, 'currency') }
    : null;
  const maxAmount = action === 'split' ? balanceOf(collateral[side]) : mergeable?.[side] ?? 0n;
  const amountRaw = parseAmount(amount);
  const amountValid = amountRaw !== null && amountRaw <= maxAmount;

  const run = async (label, send) => {
    if (!walletClient || !account) {
      onConnectWallet?.();
      return;
    }
    if (requiredChain.isWrongChain) {
      setStatus({ busy: false, message: null, error: `This market is on ${requiredChain.requiredChainName}. Switch your wallet to it to continue.` });
      return;
    }
    setStatus({ busy: true, message: `${label}…`, error: null });
    try {
      await send({ isSafe: isSafeConnection(walletClient), report: (message) => setStatus({ busy: true, message, error: null }) });
      setStatus({ busy: false, message: `${label} done.`, error: null });
      setAmount('');
      refetch();
    } catch (error) {
      setStatus({ busy: false, message: null, error: describeRedeemError(error) });
    }
  };

  const common = { publicClient, walletClient, account, router, proposal: config.MARKET_ADDRESS, batch };

  const handleSplit = () => run(`Split ${amount} ${symbols[side]}`, ({ isSafe, report }) => splitCollateral({
    ...common, isSafe, collateralToken: collateral[side], amount: amountRaw, symbol: symbols[side],
    onStep: (step) => {
      if (step === 'batch') report(`Approving and splitting ${symbols[side]} in one transaction…`);
      if (step === 'approval') report(`Approving ${symbols[side]}…`);
      if (step === 'split') report(`Splitting ${symbols[side]} into ${rows.length} outcome tokens…`);
    },
  }));

  const handleMerge = () => run(`Merge ${amount} ${symbols[side]}`, ({ isSafe, report }) => mergeOutcomeTokens({
    ...common, isSafe, collateralToken: collateral[side], amount: amountRaw,
    outcomeTokens: rows.map((row) => row[side].address),
    onStep: (step, index) => {
      if (step === 'batch') report(`Approving ${rows.length} outcome tokens and merging into ${symbols[side]} in one transaction…`);
      if (step === 'approval') report(`Approving ${rows[index][side].name} (${index + 1} of ${rows.length})…`);
      if (step === 'merge') report(`Merging into ${symbols[side]}…`);
    },
  }));

  const redeemAmounts = winner ? { company: balanceOf(winner.company.address), currency: balanceOf(winner.currency.address) } : null;
  const handleRedeem = () => run(`Redeem ${winner.label}`, async ({ report }) => {
    const cartridge = new FutarchyCartridge(router, { isSafeConnection });
    for await (const update of cartridge.completeRedeemOutcomes({
      proposal: config.MARKET_ADDRESS,
      token1Address: winner.company.address,
      token2Address: winner.currency.address,
      amount1: formatUnits(redeemAmounts.company, DECIMALS),
      amount2: formatUnits(redeemAmounts.currency, DECIMALS),
      exactApproval: true,
    }, { publicClient, walletClient, account })) {
      if (update.status === 'error') throw new Error(update.error || update.message);
      if (update.step?.startsWith('approving')) report('Approving the winning tokens…');
      if (update.step === 'redeem' || update.step === 'redeeming') report('Redeeming…');
    }
  });

  return (
    <div className="flex flex-col bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden">
      <div className="flex h-16 py-3 px-4 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70 items-center justify-between">
        <h3 className="text-futarchyGray12 dark:text-white text-sm font-semibold">Positions</h3>
        <span className="text-xs text-futarchyGray11 dark:text-white/70">
          {proposal.outcomes.length} outcomes + Invalid
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {proposal.warnings.map((warning) => (
          <div key={warning.code} role="alert" className="px-3 py-2 rounded-lg text-xs border border-futarchyGold7 bg-futarchyGold3 text-futarchyGold11 dark:bg-futarchyGold11/20 dark:text-futarchyGold7">
            <span className="font-semibold">Check this market. </span>{warning.message}
          </div>
        ))}

        {!address ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-futarchyGray11 dark:text-white/70">Connect a wallet to see your positions</p>
            <button onClick={onConnectWallet} className="px-4 py-2 rounded-lg text-xs font-semibold bg-futarchyGray4 dark:bg-futarchyDarkGray42 text-futarchyGray12 dark:text-white border border-futarchyGray6">
              Connect Wallet
            </button>
          </div>
        ) : balanceError && !balances ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm font-semibold text-futarchyGray12 dark:text-white">Couldn&apos;t load balances</p>
            <p className="text-xs text-futarchyGray11 dark:text-futarchyGray112">{balanceError}</p>
            <button onClick={refetch} className="px-4 py-2 rounded-lg text-xs font-semibold bg-futarchyGray4 dark:bg-futarchyDarkGray42 text-futarchyGray12 dark:text-white border border-futarchyGray6">Try Again</button>
          </div>
        ) : !balances ? (
          <p className="py-4 text-center text-sm text-futarchyGray11 dark:text-white/70">{isLoadingBalances ? 'Loading balances…' : ''}</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-futarchyGray11 dark:text-white/70">
                  <th className="text-left font-medium pb-2">Outcome</th>
                  <th className="text-right font-medium pb-2">{symbols.company}</th>
                  <th className="text-right font-medium pb-2">{symbols.currency}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const won = winner?.key === row.key;
                  return (
                    <tr
                      key={row.key}
                      className={`border-t border-futarchyGray62 dark:border-futarchyGray112/40 ${row.isInvalid ? 'text-futarchyGray11 dark:text-white/60' : 'text-futarchyGray12 dark:text-white'} ${won ? 'bg-futarchyGreen3 dark:bg-futarchyGreen11/20' : ''}`}
                    >
                      <td className="py-2 pr-2">
                        <span className={row.isInvalid ? 'italic' : 'font-medium'}>{row.label}</span>
                        {won && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-futarchyGreen9 text-white">Won</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums" title={row.company.name || undefined}>{format(balanceOf(row.company.address))}</td>
                      <td className="py-2 text-right tabular-nums" title={row.currency.name || undefined}>{format(balanceOf(row.currency.address))}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-futarchyGray62 dark:border-futarchyGray112/40 text-xs text-futarchyGray11 dark:text-white/70">
                  <td className="pt-2" title="Merging takes the same amount of every outcome token, Invalid included">Mergeable</td>
                  <td className="pt-2 text-right tabular-nums">{format(mergeable.company)}</td>
                  <td className="pt-2 text-right tabular-nums">{format(mergeable.currency)}</td>
                </tr>
                <tr className="text-xs text-futarchyGray11 dark:text-white/70">
                  <td className="pt-1">Wallet</td>
                  <td className="pt-1 text-right tabular-nums">{format(balanceOf(collateral.company))}</td>
                  <td className="pt-1 text-right tabular-nums">{format(balanceOf(collateral.currency))}</td>
                </tr>
              </tbody>
            </table>

            <p className="text-xs text-futarchyGray11 dark:text-white/70">
              Invalid tokens pay your collateral back if Reality answers Invalid, which undoes every trade. They have
              no pool: keep them, merging needs them.
            </p>

            {!router ? (
              <p className="text-xs text-futarchyGray11 dark:text-white/70">
                Split, merge and redeem are not available: the categorical futarchy router is not deployed on this chain yet.
              </p>
            ) : resolution?.resolved ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-futarchyGray12 dark:text-white">
                  Resolved: <span className="font-semibold">{winner?.label ?? 'unknown'}</span>
                </p>
                {winner && (redeemAmounts.company > 0n || redeemAmounts.currency > 0n) ? (
                  <button className={buttonClass} disabled={status.busy} onClick={handleRedeem}>
                    Redeem {format(redeemAmounts.company)} {symbols.company} + {format(redeemAmounts.currency)} {symbols.currency}
                  </button>
                ) : (
                  <p className="text-xs text-futarchyGray11 dark:text-white/70">You hold no {winner?.label ?? 'winning'} tokens to redeem.</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <button className={pill(action === 'split')} onClick={() => setAction('split')}>Split</button>
                    <button className={pill(action === 'merge')} onClick={() => setAction('merge')}>Merge</button>
                  </div>
                  <div className="flex gap-1">
                    <button className={pill(side === 'company')} onClick={() => setSide('company')}>{symbols.company}</button>
                    <button className={pill(side === 'currency')} onClick={() => setSide('currency')}>{symbols.currency}</button>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border-2 border-futarchyGray62 dark:border-futarchyGray112/40 bg-futarchyGray2 dark:bg-futarchyDarkGray2 px-3 py-2">
                  <input
                    aria-label={`Amount of ${symbols[side]} to ${action}`}
                    inputMode="decimal"
                    placeholder="0.0"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-sm text-futarchyGray12 dark:text-white outline-none"
                  />
                  <button
                    className="text-xs font-semibold text-futarchyGray11 dark:text-white/70 hover:text-futarchyGray12 dark:hover:text-white"
                    onClick={() => setAmount(formatUnits(maxAmount, DECIMALS))}
                  >
                    Max {format(maxAmount)}
                  </button>
                </div>
                <button
                  className={buttonClass}
                  disabled={status.busy || !amountValid}
                  onClick={action === 'split' ? handleSplit : handleMerge}
                >
                  {action === 'split'
                    ? `Split ${symbols[side]} into ${rows.length} outcome tokens`
                    : `Merge ${rows.length} outcome tokens into ${symbols[side]}`}
                </button>
              </div>
            )}

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

export default CategoricalPositionsPanel;
