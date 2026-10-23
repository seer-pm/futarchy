import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { addressesEqual, formatValue, getErrorMessage, shortAddress } from '../utils';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Surface } from '../../components/ui/Surface';

const PILL_TONES = {
  neutral: 'neutral',
  success: 'positive',
  warning: 'warning',
  error: 'negative',
};

function StatusPill({ tone = 'neutral', className = '', children }) {
  return <Badge tone={PILL_TONES[tone]} className={className}>{children}</Badge>;
}

function DetailRow({ label, value, href }) {
  const content = (
    <code
      className={`block max-w-full break-all rounded-control bg-seer-surface-raised px-2 py-1 font-mono text-xs ${
        href ? 'text-seer-accent-text' : 'text-seer-text'
      }`}
    >
      {value}
    </code>
  );

  return (
    <div className="grid min-w-0 gap-2 border-b border-seer-border py-3 last:border-b-0 md:grid-cols-[160px_minmax(0,1fr)]">
      <div className="text-[13px] font-semibold text-seer-muted">{label}</div>
      <div className="min-w-0">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="block min-w-0 hover:underline">
            {content}
          </a>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

function CheckRow({ label, state, detail }) {
  const tone = state === 'pass' ? 'success' : state === 'fail' ? 'error' : 'warning';
  const text = state === 'pass' ? 'Pass' : state === 'fail' ? 'Fail' : 'Pending';

  return (
    <div className="flex min-w-0 flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-seer-text">{label}</div>
        {detail && <div className="mt-1 break-words text-xs text-seer-muted">{detail}</div>}
      </div>
      <StatusPill tone={tone} className="self-start">{text}</StatusPill>
    </div>
  );
}

const noticeClass = 'mt-3 rounded-surface border p-3 text-sm';
const errorNoticeClass = `${noticeClass} border-seer-negative/40 bg-seer-negative/10 text-seer-negative`;

export default function OpsActionCard({ action }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: action.chainId });
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { writeContract, data: hash, error: writeError, isPending: isWritePending } = useWriteContract();
  const { isLoading: isReceiptLoading, isSuccess: isReceiptSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: action.chainId,
  });

  const [checks, setChecks] = useState({
    loading: true,
    registryOwner: null,
    factoryProposal: null,
    postcheck: null,
    error: null,
  });
  const [simulation, setSimulation] = useState({ status: 'idle', error: null });

  const connectedSignerOk = useMemo(
    () => addressesEqual(address, action.requiredSigner),
    [address, action.requiredSigner]
  );
  const chainOk = chainId === action.chainId;

  const loadChecks = useCallback(async () => {
    if (!publicClient) return;

    setChecks((current) => ({ ...current, loading: true, error: null }));

    try {
      const owner = await publicClient.readContract({
        address: action.reads.registryOwner.address,
        abi: action.reads.registryOwner.abi,
        functionName: action.reads.registryOwner.functionName,
      });

      const marketsCount = await publicClient.readContract({
        address: action.reads.factoryProposal.address,
        abi: action.reads.factoryProposal.abi,
        functionName: action.reads.factoryProposal.countFunctionName,
      });

      let proposalAddress = null;
      let proposalError = null;
      if (BigInt(marketsCount) > action.reads.factoryProposal.args[0]) {
        try {
          proposalAddress = await publicClient.readContract({
            address: action.reads.factoryProposal.address,
            abi: action.reads.factoryProposal.abi,
            functionName: action.reads.factoryProposal.functionName,
            args: action.reads.factoryProposal.args,
          });
        } catch (error) {
          proposalError = getErrorMessage(error);
        }
      }

      const postcheckResult = await publicClient.readContract({
        address: action.reads.postcheck.address,
        abi: action.reads.postcheck.abi,
        functionName: action.reads.postcheck.functionName,
        args: action.reads.postcheck.args,
      });
      const [linkedId, linkedExists] = postcheckResult;

      setChecks({
        loading: false,
        registryOwner: {
          value: owner,
          pass: addressesEqual(owner, action.reads.registryOwner.expected),
        },
        factoryProposal: {
          marketsCount,
          value: proposalAddress,
          error: proposalError,
          pass: addressesEqual(proposalAddress, action.reads.factoryProposal.expected),
        },
        postcheck: {
          id: linkedId,
          exists: linkedExists,
          pass: Boolean(linkedExists && BigInt(linkedId) === action.reads.postcheck.expected.id),
        },
        error: null,
      });
    } catch (error) {
      setChecks({
        loading: false,
        registryOwner: null,
        factoryProposal: null,
        postcheck: null,
        error: getErrorMessage(error),
      });
    }
  }, [action, publicClient]);

  useEffect(() => {
    loadChecks();
  }, [loadChecks, isReceiptSuccess]);

  const prechecksPass = Boolean(checks.registryOwner?.pass && checks.factoryProposal?.pass);
  const actionComplete = Boolean(checks.postcheck?.pass);
  const canSimulate = Boolean(isConnected && connectedSignerOk && chainOk && prechecksPass && !actionComplete && publicClient);

  useEffect(() => {
    let cancelled = false;

    async function simulate() {
      if (!canSimulate) {
        setSimulation({ status: 'idle', error: null });
        return;
      }

      setSimulation({ status: 'loading', error: null });
      try {
        await publicClient.simulateContract({
          address: action.target,
          abi: action.abi,
          functionName: action.functionName,
          args: action.args,
          account: address,
        });
        if (!cancelled) setSimulation({ status: 'success', error: null });
      } catch (error) {
        if (!cancelled) setSimulation({ status: 'error', error: getErrorMessage(error) });
      }
    }

    simulate();
    return () => {
      cancelled = true;
    };
  }, [action, address, canSimulate, publicClient]);

  const disabledReason = useMemo(() => {
    if (actionComplete) return 'Action already complete';
    if (!isConnected) return 'Connect wallet';
    if (!chainOk) return 'Switch to Gnosis Chain';
    if (!connectedSignerOk) return 'Connected wallet is not the required signer';
    if (checks.loading) return 'Loading checks';
    if (checks.error) return 'Checks failed';
    if (!prechecksPass) return 'Prechecks must pass';
    if (simulation.status === 'loading') return 'Simulating transaction';
    if (simulation.status !== 'success') return 'Simulation must pass';
    return '';
  }, [
    actionComplete,
    chainOk,
    checks.error,
    checks.loading,
    connectedSignerOk,
    isConnected,
    prechecksPass,
    simulation.status,
  ]);

  const handleSwitchChain = async () => {
    await switchChainAsync({ chainId: action.chainId });
  };

  const handleSign = () => {
    writeContract({
      address: action.target,
      abi: action.abi,
      functionName: action.functionName,
      args: action.args,
      chainId: action.chainId,
    });
  };

  return (
    <Surface data-ops-action-card className="min-w-0">
      <div className="border-b border-seer-border p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <StatusPill tone={actionComplete ? 'success' : 'warning'}>
                {actionComplete ? 'Complete' : 'Pending'}
              </StatusPill>
              <StatusPill tone={chainOk ? 'success' : 'error'}>{action.chainName}</StatusPill>
              <StatusPill tone={connectedSignerOk ? 'success' : isConnected ? 'error' : 'neutral'}>
                {isConnected ? shortAddress(address) : 'No wallet'}
              </StatusPill>
            </div>
            <h2 className="text-lg font-semibold text-seer-text">{action.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-seer-muted">{action.description}</p>
          </div>
          <Button variant="outline" onClick={loadChecks} className="self-start">
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 divide-y divide-seer-border lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:divide-x lg:divide-y-0">
        <div className="min-w-0 divide-y divide-seer-border">
          <div className="min-w-0 p-5">
            <h3 className="text-base font-semibold text-seer-text">Transaction</h3>
            <div className="mt-2">
              <DetailRow label="Contract" value={`${action.targetLabel} ${action.target}`} href={action.explorerLinks.target} />
              <DetailRow label="Function" value={action.functionName} />
              {action.displayArgs.map((arg) => (
                <DetailRow key={arg.label} label={arg.label} value={arg.value} />
              ))}
              <DetailRow label="Required signer" value={action.requiredSigner} href={action.explorerLinks.requiredSigner} />
            </div>
          </div>

          <div className="min-w-0 p-5">
            <h3 className="text-base font-semibold text-seer-text">Checks</h3>
            <div className="mt-2 divide-y divide-seer-border">
              <CheckRow
                label="Registry owner"
                state={checks.registryOwner?.pass ? 'pass' : checks.registryOwner ? 'fail' : 'pending'}
                detail={
                  checks.registryOwner
                    ? `owner() = ${checks.registryOwner.value}`
                    : 'Reads SnapshotLinkRegistry.owner()'
                }
              />
              <CheckRow
                label="Factory id points to expected market"
                state={checks.factoryProposal?.pass ? 'pass' : checks.factoryProposal ? 'fail' : 'pending'}
                detail={
                  checks.factoryProposal
                    ? checks.factoryProposal.value
                      ? `proposals(${formatValue(action.reads.factoryProposal.args[0])}) = ${checks.factoryProposal.value}`
                      : `marketsCount() = ${formatValue(checks.factoryProposal.marketsCount)}; expected id is not available yet`
                    : 'Verifies the FutarchyFactory id before enabling signing'
                }
              />
              <CheckRow
                label="Snapshot link postcheck"
                state={checks.postcheck?.pass ? 'pass' : checks.postcheck ? 'fail' : 'pending'}
                detail={
                  checks.postcheck
                    ? `getFutarchyId(snapshotId) = (${formatValue(checks.postcheck.id)}, ${formatValue(checks.postcheck.exists)})`
                    : 'Reads the current SnapshotLinkRegistry mapping'
                }
              />
              <CheckRow
                label="Simulation"
                state={
                  simulation.status === 'success'
                    ? 'pass'
                    : simulation.status === 'error'
                      ? 'fail'
                      : 'pending'
                }
                detail={
                  simulation.status === 'success'
                    ? 'Transaction simulation passed for the connected signer'
                    : simulation.error || 'Simulation runs only after wallet, chain, and prechecks pass'
                }
              />
            </div>
            {checks.error && (
              <div className={errorNoticeClass}>
                {checks.error}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 divide-y divide-seer-border">
          <div className="min-w-0 p-5">
            <h3 className="text-base font-semibold text-seer-text">Signer</h3>
            <div className="mt-3 space-y-3 text-sm text-seer-muted">
              <div>
                <div className="text-[13px] font-semibold text-seer-muted">Connected wallet</div>
                <code className="mt-1 block break-all rounded-control bg-seer-surface-raised px-2 py-1 font-mono text-xs text-seer-text">
                  {address || 'Not connected'}
                </code>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-seer-muted">Required wallet</div>
                <code className="mt-1 block break-all rounded-control bg-seer-surface-raised px-2 py-1 font-mono text-xs text-seer-text">
                  {action.requiredSigner}
                </code>
              </div>
            </div>
          </div>

          <div className="min-w-0 p-5">
            <h3 className="text-base font-semibold text-seer-text">Sign</h3>
            <p className="mt-2 text-sm leading-6 text-seer-muted">
              This button sends only the decoded transaction shown on this card. It does not build calldata from user input.
            </p>
            {!chainOk && isConnected ? (
              <Button
                block
                onClick={handleSwitchChain}
                disabled={isSwitching}
                busy={isSwitching}
                className="mt-4"
              >
                {isSwitching ? 'Switching...' : 'Switch to Gnosis Chain'}
              </Button>
            ) : (
              <Button
                block
                onClick={handleSign}
                disabled={Boolean(disabledReason) || isWritePending || isReceiptLoading}
                busy={isWritePending || isReceiptLoading}
                className="mt-4"
              >
                {isWritePending || isReceiptLoading ? 'Waiting for wallet...' : 'Sign transaction'}
              </Button>
            )}
            {disabledReason && (
              <div className={`${noticeClass} border-seer-border bg-seer-surface-raised text-seer-muted`}>
                {disabledReason}
              </div>
            )}
            {writeError && (
              <div className={errorNoticeClass}>
                {getErrorMessage(writeError)}
              </div>
            )}
            {hash && (
              <div className={`${noticeClass} border-seer-positive/40 bg-seer-positive/10 text-seer-positive`}>
                <div className="font-semibold">Transaction submitted</div>
                <a
                  href={`https://gnosisscan.io/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all font-mono text-xs text-seer-accent-text underline"
                >
                  {hash}
                </a>
                <div className="mt-2 text-xs">
                  {isReceiptSuccess ? 'Receipt confirmed. Postcheck refreshed.' : 'Waiting for receipt.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}
