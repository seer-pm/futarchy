import { useMemo, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import FutarchyCartridge from 'futarchy-sdk/executors/FutarchyCartridge';
import { useAtomicBatch } from '../../../hooks/useAtomicBatch';
import { useRequiredChain } from '../../../hooks/useChainValidation';
import { useSafeConnection } from '../../../hooks/useSafeConnection';
import { mergeThrough, splitThrough } from '../../../utils/collateralActions';
import { formatWith } from '../../../utils/precisionFormatter';
import { familyLeaves, familyMergeable, familyMergePlan, familyRedeemPlan, familySlots, familySplitPlan } from '../../../utils/proposalFamily';
import { CATEGORICAL_ROUTER_BY_CHAIN } from '../../../utils/proposalOutcomes';
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
 * Positions of a categorical futarchy market (N answers plus INVALID, and the
 * follow-up questions chained to its answers, utils/proposalFamily.js): the
 * balance of every outcome token, split and merge over all of them, and
 * redemption of what won. A split goes down to the market's answers, through
 * every follow-up question; a merge takes them back up. Binary proposals use
 * MarketBalancePanel.
 */
const CategoricalPositionsPanel = ({ categorical, config, address, onConnectWallet }) => {
  const { proposal, family, resolution, balances, isLoadingBalances, balanceError, refetch } = categorical;
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

  // The market's answers in the order the outcomes show them, then the answers
  // follow-up questions split again, then every question's INVALID: each
  // question has its own INVALID tokens, named after the question past the first.
  const rows = useMemo(() => {
    const slots = familySlots(family);
    const byKey = new Map(slots.map((slot) => [slot.key, slot]));
    const invalids = slots.filter((slot) => slot.isInvalid);
    return [
      ...familyLeaves(family).map((leaf) => byKey.get(leaf.key)),
      ...slots.filter((slot) => slot.chained),
      ...invalids.map((slot, i) => (i === 0 ? slot : { ...slot, label: `Invalid (question ${i + 1})` })),
    ];
  }, [family]);
  // What a split gives: the market's answers and every question's INVALID.
  const answerCount = useMemo(() => familyLeaves(family).length + rows.filter((row) => row.isInvalid).length, [family, rows]);
  const winner = resolution?.winner ?? null;
  const symbols = {
    company: config?.BASE_TOKENS_CONFIG?.company?.symbol || proposal.invalid.company.name?.replace(/^INVALID_/, ''),
    currency: config?.BASE_TOKENS_CONFIG?.currency?.symbol || proposal.invalid.currency.name?.replace(/^INVALID_/, ''),
  };
  const collateral = { company: proposal.companyToken, currency: proposal.currencyToken };
  const balanceOf = (token) => balances?.get(token.toLowerCase()) ?? 0n;
  // An answer a follow-up question splits again, such as "Other", is not an
  // outcome of the market, and a follow-up question's INVALID is one more
  // INVALID: both are shown only while the wallet holds their tokens.
  const visibleRows = rows.filter((row) => !(row.chained || (row.isInvalid && row.node.parent))
    || balanceOf(row.company.address) > 0n || balanceOf(row.currency.address) > 0n);
  const mergeable = balances
    ? { company: familyMergeable(family, balances, 'company'), currency: familyMergeable(family, balances, 'currency') }
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

  const common = { publicClient, walletClient, account, router, batch };
  const questions = family.root.children.size > 0;

  const handleSplit = () => run(`Split ${amount} ${symbols[side]}`, ({ isSafe, report }) => {
    const steps = familySplitPlan(family, side, amountRaw);
    return splitThrough({
      ...common, isSafe, steps, symbol: symbols[side],
      onStep: (step, index) => {
        if (step === 'batch') report(`Approving and splitting ${symbols[side]} in one transaction…`);
        if (step === 'split') report(steps.length > 1
          ? `Splitting into the answers of question ${index + 1} of ${steps.length}…`
          : `Splitting ${symbols[side]} into ${answerCount} outcome tokens…`);
      },
    });
  });

  const handleMerge = () => run(`Merge ${amount} ${symbols[side]}`, ({ isSafe, report }) => {
    const steps = familyMergePlan(family, side, amountRaw, balances);
    return mergeThrough({
      ...common, isSafe, steps,
      onStep: (step, index) => {
        if (step === 'batch') report(`Approving the outcome tokens and merging into ${symbols[side]} in one transaction…`);
        if (step === 'merge') report(steps.length > 1 ? `Merging question ${steps.length - index} of ${steps.length}…` : `Merging into ${symbols[side]}…`);
      },
    });
  });

  // Deepest question first: its winning tokens pay the answer above it.
  const redeemSteps = resolution ? familyRedeemPlan(resolution, balances) : [];
  const redeemTotal = redeemSteps.length > 0 ? redeemSteps[redeemSteps.length - 1].amounts : null;
  const redeemsCollateral = redeemSteps.length > 0 && redeemSteps[redeemSteps.length - 1].node.parent === null;
  const handleRedeem = () => run(`Redeem ${winner?.label ?? 'winnings'}`, async ({ report }) => {
    const cartridge = new FutarchyCartridge(router, { isSafeConnection });
    for (const [index, redeem] of redeemSteps.entries()) {
      for await (const update of cartridge.completeRedeemOutcomes({
        proposal: redeem.proposal,
        token1Address: redeem.company.address,
        token2Address: redeem.currency.address,
        amount1: formatUnits(redeem.amounts.company, DECIMALS),
        amount2: formatUnits(redeem.amounts.currency, DECIMALS),
        exactApproval: true,
      }, { publicClient, walletClient, account })) {
        if (update.status === 'error') throw new Error(update.error || update.message);
        const of = redeemSteps.length > 1 ? ` (${index + 1} of ${redeemSteps.length})` : '';
        if (update.step?.startsWith('approving')) report(`Approving the winning tokens${of}…`);
        if (update.step === 'redeem' || update.step === 'redeeming') report(`Redeeming${of}…`);
      }
    }
  });

  return (
    <div className="flex flex-col bg-futarchyGray3 dark:bg-futarchyDarkGray3 rounded-3xl border-2 border-futarchyGray62 dark:border-futarchyGray11/70 overflow-hidden">
      <div className="flex h-16 py-3 px-4 bg-futarchyGray2 dark:bg-futarchyDarkGray2 border-b-2 border-futarchyGray62 dark:border-futarchyGray11/70 items-center justify-between">
        <h3 className="text-futarchyGray12 dark:text-white text-sm font-semibold">Positions</h3>
        <span className="text-xs text-futarchyGray11 dark:text-white/70">
          {questions ? `${familyLeaves(family).length} outcomes` : `${proposal.outcomes.length} outcomes + Invalid`}
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {[...family.warnings, ...rows.filter((row) => row.isInvalid).flatMap((row) => row.node.proposal.warnings)].map((warning, i) => (
          <div key={`${warning.code}-${i}`} role="alert" className="px-3 py-2 rounded-lg text-xs border border-futarchyGold7 bg-futarchyGold3 text-futarchyGold11 dark:bg-futarchyGold11/20 dark:text-futarchyGold7">
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
                {visibleRows.map((row) => {
                  const won = winner?.key === row.key;
                  return (
                    <tr
                      key={row.key}
                      className={`border-t border-futarchyGray62 dark:border-futarchyGray112/40 ${row.isInvalid || row.chained ? 'text-futarchyGray11 dark:text-white/60' : 'text-futarchyGray12 dark:text-white'} ${won ? 'bg-futarchyGreen3 dark:bg-futarchyGreen11/20' : ''}`}
                    >
                      <td className="py-2 pr-2">
                        <span
                          className={row.isInvalid ? 'italic' : 'font-medium'}
                          title={row.chained ? 'A follow-up question splits these tokens into its answers' : undefined}
                        >
                          {row.label}{row.chained && ' \u2192'}
                        </span>
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
              {visibleRows.some((row) => row.chained) && ' Answers marked \u2192 are split again by a follow-up question into answers listed above.'}
            </p>

            {!router ? (
              <p className="text-xs text-futarchyGray11 dark:text-white/70">
                Split, merge and redeem are not available: the categorical futarchy router is not deployed on this chain yet.
              </p>
            ) : resolution?.resolved || resolution?.pending ? (
              <div className="flex flex-col gap-2">
                {resolution.resolved ? (
                  <p className="text-sm text-futarchyGray12 dark:text-white">
                    Resolved: <span className="font-semibold">{winner?.label ?? 'unknown'}</span>
                  </p>
                ) : (
                  <p className="text-sm text-futarchyGray12 dark:text-white">
                    <span className="font-semibold">{resolution.paid.map(({ node, index }) => node.proposal.outcomes[index]?.label ?? 'Invalid').join(' \u2192 ')}</span>
                    {' '}won. Its follow-up question is not resolved yet: its tokens can be redeemed once it is.
                  </p>
                )}
                {redeemTotal ? (
                  <button className={buttonClass} disabled={status.busy} onClick={handleRedeem}>
                    Redeem {format(redeemTotal.company)} {redeemsCollateral ? symbols.company : redeemSteps[redeemSteps.length - 1].company.name}
                    {' + '}{format(redeemTotal.currency)} {redeemsCollateral ? symbols.currency : redeemSteps[redeemSteps.length - 1].currency.name}
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
                    ? `Split ${symbols[side]} into ${answerCount} outcome tokens`
                    : `Merge ${answerCount} outcome tokens into ${symbols[side]}`}
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
