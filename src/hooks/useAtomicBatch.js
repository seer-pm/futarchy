import { useAccount, useCapabilities } from 'wagmi';
import { isAtomicBatchCapable } from '../utils/batchCalls';

/**
 * Whether the connected wallet can send several calls as one atomic
 * transaction on its current chain (EIP-5792 `atomic` capability, through an
 * EIP-7702 smart account or a smart contract wallet). Pass the result as
 * `batch` to the split, merge and trade helpers; see utils/batchCalls.js.
 */
export function useAtomicBatch() {
  const { address, chainId } = useAccount();
  const { data: capabilities } = useCapabilities({
    account: address,
    // Wallets without EIP-5792 reject wallet_getCapabilities: no batching
    query: { enabled: Boolean(address), retry: false, staleTime: 60_000 },
  });
  return Boolean(chainId) && isAtomicBatchCapable(capabilities, chainId);
}
