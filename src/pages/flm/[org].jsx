import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

import Header from '../../components/common/Header';
import Footer from '../../components/common/Footer';
import {
  ERC20_ABI,
  FLM_MANAGER_ABI,
  FULCRUM_TICK_LOWER,
  FULCRUM_TICK_UPPER,
  encodeAddParams,
  encodeDualExitParams,
  encodeExitParams,
  formatTokenAmount,
  getBrowserProvider,
  getFlmConfigBySlug,
  getFlmConfigs,
  getGnosisExplorerAddressUrl,
  getGnosisExplorerTxUrl,
  getReadOnlyGnosisProvider,
  isConfiguredAddress,
  parseTokenAmount,
  shortAddress,
} from '../../utils/flm';

const DEFAULT_DEADLINE_SECONDS = 1800;
const ZERO = ethers.constants.Zero;

function nextDeadline() {
  return String(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
}

function formatUtcTime(timestamp) {
  if (!timestamp) return 'Pending';
  return `${new Date(timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function formatLpShares(value, decimals) {
  return `${formatTokenAmount(value, decimals)} LP shares`;
}

async function readOr(contractCall, fallback) {
  try {
    return await contractCall();
  } catch {
    return fallback;
  }
}

function safeParseAmount(value, decimals) {
  try {
    return parseTokenAmount(value, decimals);
  } catch {
    return ZERO;
  }
}

function FormInput({
  label,
  value,
  onChange,
  placeholder = '0',
  inputMode = 'decimal',
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-futarchyGray11">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-11 w-full rounded-lg border border-futarchyGray5 bg-white px-3 text-sm text-futarchyGray12 outline-none transition-colors placeholder:text-futarchyGray10 focus:border-futarchyViolet7"
      />
    </label>
  );
}

function Section({ title, action, children }) {
  return (
    <section className="rounded-lg border border-futarchyGray5 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-futarchyGray12">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, tone = 'default' }) {
  const toneClass = tone === 'accent' ? 'text-futarchyTeal9' : 'text-futarchyGray12';
  return (
    <div className="border-b border-futarchyGray4 pb-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-futarchyGray11">{label}</div>
      <div className={`mt-1 break-words text-base font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function AddressLink({ address }) {
  const href = getGnosisExplorerAddressUrl(address);
  if (!href) {
    return <span className="text-futarchyGray11">Pending</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-futarchyBlue11 hover:text-futarchyBlue9"
    >
      <span>{shortAddress(address)}</span>
      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
    </a>
  );
}

function TxStatus({ status }) {
  if (!status.message) return null;

  const href = getGnosisExplorerTxUrl(status.hash);
  const tone = status.type === 'error'
    ? 'border-futarchyCrimson5 bg-futarchyCrimson3 text-futarchyCrimson11'
    : 'border-futarchyTeal4 bg-futarchyTeal3 text-futarchyTeal11';

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span>{status.message}</span>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold"
          >
            Transaction
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  disabled = false,
  icon: Icon,
  onClick,
  variant = 'primary',
}) {
  const base = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'bg-futarchyGray12 text-white hover:bg-futarchyGray11',
    secondary: 'border border-futarchyGray5 bg-white text-futarchyGray12 hover:bg-futarchyGray3',
    accent: 'bg-futarchyTeal9 text-white hover:bg-futarchyTeal10',
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${variants[variant]}`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      <span>{children}</span>
    </button>
  );
}

export default function FlmPage({ config }) {
  const { address } = useAccount();
  const managerConfigured = isConfiguredAddress(config.managerAddress);
  const proposalSourceConfigured = isConfiguredAddress(config.proposalSourceAddress);

  const [deposit, setDeposit] = useState({
    companyAmount: '',
    collateralAmount: '',
    tickLower: String(FULCRUM_TICK_LOWER),
    tickUpper: String(FULCRUM_TICK_UPPER),
    amount0Min: '0',
    amount1Min: '0',
    deadline: '0',
    sqrtPriceX96: '0',
  });

  const [redeem, setRedeem] = useState({
    shares: '',
    recipient: '',
    spotAmount0Min: '0',
    spotAmount1Min: '0',
    spotDeadline: '0',
    yesAmount0Min: '0',
    yesAmount1Min: '0',
    yesDeadline: '0',
    noAmount0Min: '0',
    noAmount1Min: '0',
    noDeadline: '0',
  });

  const [readState, setReadState] = useState({
    loading: false,
    error: null,
    token: {
      symbol: config.token.symbol,
      decimals: config.token.decimals,
      balance: ZERO,
      allowance: ZERO,
    },
    collateral: {
      symbol: config.collateral.symbol,
      decimals: config.collateral.decimals,
      balance: ZERO,
      allowance: ZERO,
    },
    manager: {
      name: 'FLM',
      symbol: 'FLM',
      shareDecimals: 18,
      totalSupply: ZERO,
      walletShares: ZERO,
      spotLiquidity: ZERO,
      conditionalYesLiquidity: ZERO,
      conditionalNoLiquidity: ZERO,
      inConditionalMode: false,
      activeProposal: ethers.constants.AddressZero,
    },
  });

  const [txStatus, setTxStatus] = useState({ type: 'idle', message: '', hash: '' });
  const [pendingAction, setPendingAction] = useState('');

  useEffect(() => {
    if (!address) return;
    setRedeem((current) => current.recipient ? current : { ...current, recipient: address });
  }, [address]);

  useEffect(() => {
    const deadline = nextDeadline();
    setDeposit((current) => current.deadline !== '0' ? current : { ...current, deadline });
    setRedeem((current) => {
      if (current.spotDeadline !== '0' || current.yesDeadline !== '0' || current.noDeadline !== '0') {
        return current;
      }

      return {
        ...current,
        spotDeadline: deadline,
        yesDeadline: deadline,
        noDeadline: deadline,
      };
    });
  }, []);

  const refreshPositions = useCallback(async () => {
    if (!managerConfigured) {
      setReadState((current) => ({
        ...current,
        loading: false,
        error: null,
      }));
      return;
    }

    setReadState((current) => ({ ...current, loading: true, error: null }));

    try {
      const provider = getReadOnlyGnosisProvider();
      const manager = new ethers.Contract(config.managerAddress, FLM_MANAGER_ABI, provider);
      const companyToken = new ethers.Contract(config.token.address, ERC20_ABI, provider);
      const collateralToken = new ethers.Contract(config.collateral.address, ERC20_ABI, provider);
      const wallet = address || ethers.constants.AddressZero;

      const [
        managerName,
        managerSymbol,
        shareDecimals,
        totalSupply,
        walletShares,
        spotLiquidity,
        conditionalYesLiquidity,
        conditionalNoLiquidity,
        inConditionalMode,
        activeProposal,
        companySymbol,
        companyDecimals,
        companyBalance,
        companyAllowance,
        collateralSymbol,
        collateralDecimals,
        collateralBalance,
        collateralAllowance,
      ] = await Promise.all([
        readOr(() => manager.name(), 'FLM'),
        readOr(() => manager.symbol(), 'FLM'),
        readOr(() => manager.decimals(), 18),
        readOr(() => manager.totalSupply(), ZERO),
        address ? readOr(() => manager.balanceOf(wallet), ZERO) : ZERO,
        readOr(() => manager.spotLiquidity(), ZERO),
        readOr(() => manager.conditionalYesLiquidity(), ZERO),
        readOr(() => manager.conditionalNoLiquidity(), ZERO),
        readOr(() => manager.inConditionalMode(), false),
        readOr(() => manager.activeProposal(), ethers.constants.AddressZero),
        readOr(() => companyToken.symbol(), config.token.symbol),
        readOr(() => companyToken.decimals(), config.token.decimals),
        address ? readOr(() => companyToken.balanceOf(wallet), ZERO) : ZERO,
        address ? readOr(() => companyToken.allowance(wallet, config.managerAddress), ZERO) : ZERO,
        readOr(() => collateralToken.symbol(), config.collateral.symbol),
        readOr(() => collateralToken.decimals(), config.collateral.decimals),
        address ? readOr(() => collateralToken.balanceOf(wallet), ZERO) : ZERO,
        address ? readOr(() => collateralToken.allowance(wallet, config.managerAddress), ZERO) : ZERO,
      ]);

      setReadState({
        loading: false,
        error: null,
        token: {
          symbol: companySymbol,
          decimals: companyDecimals,
          balance: companyBalance,
          allowance: companyAllowance,
        },
        collateral: {
          symbol: collateralSymbol,
          decimals: collateralDecimals,
          balance: collateralBalance,
          allowance: collateralAllowance,
        },
        manager: {
          name: managerName,
          symbol: managerSymbol,
          shareDecimals,
          totalSupply,
          walletShares,
          spotLiquidity,
          conditionalYesLiquidity,
          conditionalNoLiquidity,
          inConditionalMode,
          activeProposal,
        },
      });
    } catch (error) {
      setReadState((current) => ({
        ...current,
        loading: false,
        error: error.message || 'Unable to read liquidity manager position state.',
      }));
    }
  }, [address, config, managerConfigured]);

  useEffect(() => {
    refreshPositions();
  }, [refreshPositions]);

  const amountChecks = useMemo(() => {
    const companyAmount = safeParseAmount(deposit.companyAmount, readState.token.decimals);
    const collateralAmount = safeParseAmount(deposit.collateralAmount, readState.collateral.decimals);
    const shareAmount = safeParseAmount(redeem.shares, readState.manager.shareDecimals);

    return {
      companyAmount,
      collateralAmount,
      shareAmount,
      needsCompanyApproval: companyAmount.gt(0) && readState.token.allowance.lt(companyAmount),
      needsCollateralApproval: collateralAmount.gt(0) && readState.collateral.allowance.lt(collateralAmount),
      hasDepositAmount: companyAmount.gt(0) || collateralAmount.gt(0),
      hasShares: shareAmount.gt(0),
    };
  }, [deposit, readState, redeem.shares]);

  const depositsDisabledInConditionalMode = readState.manager.inConditionalMode;
  const depositActionDisabled = !managerConfigured
    || !address
    || Boolean(pendingAction)
    || !amountChecks.hasDepositAmount
    || depositsDisabledInConditionalMode;
  const approvalActionDisabled = !managerConfigured
    || !address
    || Boolean(pendingAction)
    || depositsDisabledInConditionalMode;

  const updateDeposit = (field, value) => {
    setDeposit((current) => ({ ...current, [field]: value }));
  };

  const updateRedeem = (field, value) => {
    setRedeem((current) => ({ ...current, [field]: value }));
  };

  const runWalletAction = async (actionName, callback) => {
    setPendingAction(actionName);
    setTxStatus({ type: 'info', message: 'Waiting for wallet confirmation.', hash: '' });

    try {
      const provider = await getBrowserProvider();
      const signer = provider.getSigner();
      const tx = await callback(signer);
      setTxStatus({ type: 'info', message: 'Transaction submitted.', hash: tx.hash });
      await tx.wait();
      setTxStatus({ type: 'success', message: 'Transaction confirmed.', hash: tx.hash });
      await refreshPositions();
    } catch (error) {
      setTxStatus({
        type: 'error',
        message: error?.data?.message || error?.reason || error?.message || 'Transaction failed.',
        hash: '',
      });
    } finally {
      setPendingAction('');
    }
  };

  const approveToken = (kind) => {
    const tokenConfig = kind === 'company' ? config.token : config.collateral;
    const amount = kind === 'company' ? amountChecks.companyAmount : amountChecks.collateralAmount;

    return runWalletAction(`approve-${kind}`, async (signer) => {
      if (!managerConfigured) throw new Error('Liquidity manager is not configured.');
      if (amount.lte(0)) throw new Error('Enter an approval amount first.');

      const token = new ethers.Contract(tokenConfig.address, ERC20_ABI, signer);
      return token.approve(config.managerAddress, amount);
    });
  };

  const depositToSpot = () => {
    return runWalletAction('deposit', async (signer) => {
      if (!managerConfigured) throw new Error('Liquidity manager is not configured.');
      if (depositsDisabledInConditionalMode) {
        throw new Error('Cannot deposit while the manager is in conditional mode.');
      }
      if (!amountChecks.hasDepositAmount) throw new Error('Enter a deposit amount first.');
      if (amountChecks.needsCompanyApproval || amountChecks.needsCollateralApproval) {
        throw new Error('Approve the deposit tokens first.');
      }

      const manager = new ethers.Contract(config.managerAddress, FLM_MANAGER_ABI, signer);
      const addData = encodeAddParams({
        tickLower: deposit.tickLower,
        tickUpper: deposit.tickUpper,
        amount0Min: deposit.amount0Min,
        amount1Min: deposit.amount1Min,
        deadline: deposit.deadline,
        sqrtPriceX96: deposit.sqrtPriceX96,
      });

      return manager['depositToSpot(uint256,uint256,bytes)'](
        amountChecks.companyAmount,
        amountChecks.collateralAmount,
        addData
      );
    });
  };

  const redeemShares = () => {
    return runWalletAction('redeem', async (signer) => {
      if (!managerConfigured) throw new Error('Liquidity manager is not configured.');
      if (!amountChecks.hasShares) throw new Error('Enter a share amount first.');
      if (!isConfiguredAddress(redeem.recipient)) throw new Error('Enter a valid recipient address.');

      const manager = new ethers.Contract(config.managerAddress, FLM_MANAGER_ABI, signer);
      const spotExitData = encodeExitParams({
        amount0Min: redeem.spotAmount0Min,
        amount1Min: redeem.spotAmount1Min,
        deadline: redeem.spotDeadline,
      });
      const yesExitData = encodeExitParams({
        amount0Min: redeem.yesAmount0Min,
        amount1Min: redeem.yesAmount1Min,
        deadline: redeem.yesDeadline,
      });
      const noExitData = encodeExitParams({
        amount0Min: redeem.noAmount0Min,
        amount1Min: redeem.noAmount1Min,
        deadline: redeem.noDeadline,
      });

      return manager.redeem(
        amountChecks.shareAmount,
        redeem.recipient,
        false,
        spotExitData,
        encodeDualExitParams(yesExitData, noExitData)
      );
    });
  };

  const disabledReason = !managerConfigured ? 'Pending deployment' : (!address ? 'Connect wallet' : '');
  const proposal = config.activeProposal;

  return (
    <>
      <Head>
        <title>{config.organizationName} Liquidity Manager | Futarchy</title>
        <meta
          name="description"
          content={`${config.organizationName} liquidity manager for the ${config.pair} futarchy market pair.`}
        />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <Header />

      <main className="min-h-screen bg-futarchyGray2 px-4 pb-16 pt-28 text-futarchyGray12">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-futarchyGray11">
                {config.organizationName} Liquidity Manager
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-futarchyGray12 md:text-4xl">
                {config.pair} Liquidity
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-futarchyGray11">
                FLM means Futarchy Liquidity Manager. It is the LP tool for this pair:
                deposit liquidity, receive LP shares, and let the manager keep liquidity
                available for the spot market or the YES/NO markets when an official
                proposal is active.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-lg border border-futarchyGray5 bg-white px-3 py-1 font-medium text-futarchyGray11">
                  Gnosis Chain
                </span>
                <span className="rounded-lg border border-futarchyGray5 bg-white px-3 py-1 font-medium text-futarchyGray11">
                  {config.status}
                </span>
                {disabledReason && (
                  <span className="rounded-lg border border-futarchyGold5 bg-futarchyGold3 px-3 py-1 font-medium text-futarchyGold11">
                    {disabledReason}
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-futarchyGray5 bg-white p-3 shadow-sm">
              <ConnectButton />
            </div>
          </section>

          <TxStatus status={txStatus} />

          <Section
            title="Contracts"
            action={(
              <ActionButton
                variant="secondary"
                icon={ArrowPathIcon}
                onClick={refreshPositions}
                disabled={!managerConfigured || readState.loading}
              >
                {readState.loading ? 'Refreshing' : 'Refresh'}
              </ActionButton>
            )}
          >
            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Manager" value={<AddressLink address={config.managerAddress} />} />
              <Metric label="Proposal source" value={<AddressLink address={config.proposalSourceAddress} />} />
              <Metric label="Active proposal" value={<AddressLink address={readState.manager.activeProposal} />} />
              <Metric
                label="Status"
                value={managerConfigured && proposalSourceConfigured ? 'Configured' : 'Pending deployment'}
                tone={managerConfigured && proposalSourceConfigured ? 'accent' : 'default'}
              />
            </div>
            {readState.error && (
              <div className="mt-3 rounded-lg border border-futarchyCrimson5 bg-futarchyCrimson3 px-3 py-2 text-sm text-futarchyCrimson11">
                {readState.error}
              </div>
            )}
          </Section>

          <Section title="Official Proposal">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-futarchyGray11">
                  {proposal.label}
                </div>
                <div className="mt-1 text-lg font-semibold text-futarchyGray12">{proposal.title}</div>
                <div className="mt-2 text-sm text-futarchyGray11">
                  Closes {formatUtcTime(proposal.closeTimestamp)}
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2 md:justify-end">
                <Link
                  href={proposal.marketUrl}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-futarchyGray5 bg-white px-4 text-sm font-semibold text-futarchyGray12 hover:bg-futarchyGray3"
                >
                  <BanknotesIcon className="h-4 w-4" />
                  <span>Market</span>
                </Link>
                <a
                  href={proposal.snapshotUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-futarchyGray12 px-4 text-sm font-semibold text-white hover:bg-futarchyGray11"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  <span>Snapshot</span>
                </a>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Metric label="Market address" value={<AddressLink address={proposal.marketAddress} />} />
              <Metric label="Snapshot ID" value={shortAddress(proposal.snapshotId)} />
              <Metric label="Metadata" value={<AddressLink address={proposal.proposalMetadataAddress} />} />
            </div>
          </Section>

          <Section title="LP Position">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Your LP shares"
                value={formatLpShares(readState.manager.walletShares, readState.manager.shareDecimals)}
                tone="accent"
              />
              <Metric
                label="Total LP shares"
                value={formatLpShares(readState.manager.totalSupply, readState.manager.shareDecimals)}
              />
              <Metric
                label="Mode"
                value={readState.manager.inConditionalMode ? 'Conditional' : 'Spot'}
                tone={readState.manager.inConditionalMode ? 'accent' : 'default'}
              />
              <Metric label="Spot liquidity" value={readState.manager.spotLiquidity.toString()} />
              <Metric label="YES liquidity" value={readState.manager.conditionalYesLiquidity.toString()} />
              <Metric label="NO liquidity" value={readState.manager.conditionalNoLiquidity.toString()} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric
                label={`${readState.token.symbol} balance`}
                value={formatTokenAmount(readState.token.balance, readState.token.decimals)}
              />
              <Metric
                label={`${readState.collateral.symbol} balance`}
                value={formatTokenAmount(readState.collateral.balance, readState.collateral.decimals)}
              />
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Add Liquidity">
              {depositsDisabledInConditionalMode && (
                <div className="mb-4 rounded-lg border border-futarchyGold5 bg-futarchyGold3 px-3 py-2 text-sm font-medium text-futarchyGold11">
                  Deposits are paused while this manager is in conditional mode.
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormInput
                  label={config.token.symbol}
                  value={deposit.companyAmount}
                  onChange={(value) => updateDeposit('companyAmount', value)}
                />
                <FormInput
                  label={config.collateral.symbol}
                  value={deposit.collateralAmount}
                  onChange={(value) => updateDeposit('collateralAmount', value)}
                />
                <FormInput
                  label="Tick lower"
                  value={deposit.tickLower}
                  onChange={(value) => updateDeposit('tickLower', value)}
                  inputMode="numeric"
                />
                <FormInput
                  label="Tick upper"
                  value={deposit.tickUpper}
                  onChange={(value) => updateDeposit('tickUpper', value)}
                  inputMode="numeric"
                />
                <FormInput
                  label="Amount0 min"
                  value={deposit.amount0Min}
                  onChange={(value) => updateDeposit('amount0Min', value)}
                />
                <FormInput
                  label="Amount1 min"
                  value={deposit.amount1Min}
                  onChange={(value) => updateDeposit('amount1Min', value)}
                />
                <FormInput
                  label="Deadline"
                  value={deposit.deadline}
                  onChange={(value) => updateDeposit('deadline', value)}
                  inputMode="numeric"
                />
                <FormInput
                  label="sqrtPriceX96"
                  value={deposit.sqrtPriceX96}
                  onChange={(value) => updateDeposit('sqrtPriceX96', value)}
                  inputMode="numeric"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton
                  variant="secondary"
                  icon={CheckCircleIcon}
                  onClick={() => approveToken('company')}
                  disabled={approvalActionDisabled || !amountChecks.companyAmount.gt(0)}
                >
                  Approve {config.token.symbol}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  icon={CheckCircleIcon}
                  onClick={() => approveToken('collateral')}
                  disabled={approvalActionDisabled || !amountChecks.collateralAmount.gt(0)}
                >
                  Approve {config.collateral.symbol}
                </ActionButton>
                <ActionButton
                  variant="accent"
                  icon={BanknotesIcon}
                  onClick={depositToSpot}
                  disabled={depositActionDisabled}
                >
                  {depositsDisabledInConditionalMode ? 'Deposits paused' : 'Deposit'}
                </ActionButton>
              </div>

              <div className="mt-3 text-sm text-futarchyGray11">
                Allowance: {formatTokenAmount(readState.token.allowance, readState.token.decimals)} {config.token.symbol}
                {' / '}
                {formatTokenAmount(readState.collateral.allowance, readState.collateral.decimals)} {config.collateral.symbol}
              </div>
            </Section>

            <Section title="Remove Liquidity">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormInput
                  label="Shares"
                  value={redeem.shares}
                  onChange={(value) => updateRedeem('shares', value)}
                />
                <FormInput
                  label="Recipient"
                  value={redeem.recipient}
                  onChange={(value) => updateRedeem('recipient', value)}
                  placeholder="0x..."
                  inputMode="text"
                />
                <FormInput
                  label="Spot amount0 min"
                  value={redeem.spotAmount0Min}
                  onChange={(value) => updateRedeem('spotAmount0Min', value)}
                />
                <FormInput
                  label="Spot amount1 min"
                  value={redeem.spotAmount1Min}
                  onChange={(value) => updateRedeem('spotAmount1Min', value)}
                />
                <FormInput
                  label="Spot deadline"
                  value={redeem.spotDeadline}
                  onChange={(value) => updateRedeem('spotDeadline', value)}
                  inputMode="numeric"
                />
                <FormInput
                  label="YES amount0 min"
                  value={redeem.yesAmount0Min}
                  onChange={(value) => updateRedeem('yesAmount0Min', value)}
                />
                <FormInput
                  label="YES amount1 min"
                  value={redeem.yesAmount1Min}
                  onChange={(value) => updateRedeem('yesAmount1Min', value)}
                />
                <FormInput
                  label="YES deadline"
                  value={redeem.yesDeadline}
                  onChange={(value) => updateRedeem('yesDeadline', value)}
                  inputMode="numeric"
                />
                <FormInput
                  label="NO amount0 min"
                  value={redeem.noAmount0Min}
                  onChange={(value) => updateRedeem('noAmount0Min', value)}
                />
                <FormInput
                  label="NO amount1 min"
                  value={redeem.noAmount1Min}
                  onChange={(value) => updateRedeem('noAmount1Min', value)}
                />
                <FormInput
                  label="NO deadline"
                  value={redeem.noDeadline}
                  onChange={(value) => updateRedeem('noDeadline', value)}
                  inputMode="numeric"
                />
              </div>

              <div className="mt-4">
                <ActionButton
                  variant="primary"
                  icon={BanknotesIcon}
                  onClick={redeemShares}
                  disabled={!managerConfigured || !address || Boolean(pendingAction) || !amountChecks.hasShares}
                >
                  Redeem
                </ActionButton>
              </div>
            </Section>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: getFlmConfigs().map((config) => ({ params: { org: config.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const config = getFlmConfigBySlug(params.org);

  if (!config) {
    return { notFound: true };
  }

  return {
    props: {
      config,
    },
  };
}
