const SAFE_TX_SERVICE_URLS = {
    1: 'https://safe-transaction-mainnet.safe.global',
    100: 'https://safe-transaction-gnosis-chain.safe.global',
    11155111: 'https://safe-transaction-sepolia.safe.global',
    // Add other chains as needed
};

/**
 * Waits for a Safe tx to be executed on-chain, then returns a normal viem receipt.
 */
export async function waitForSafeTxReceipt({
    chainId,
    safeTxHash,
    publicClient,
    timeoutMs = 120_000,
    pollIntervalMs = 4_000,
    onStatus, // Callback for status updates: (status) => void
}) {
    const txServiceUrl = SAFE_TX_SERVICE_URLS[chainId];
    if (!txServiceUrl) {
        throw new Error(`No Safe tx service URL for chainId=${chainId}`);
    }

    // @safe-global/api-kit drags in protocol-kit, types-kit and
    // safe-deployments — over half a megabyte of source that only matters once
    // a transaction has actually gone out through a Safe. Importing it here
    // rather than at module scope keeps it out of the market bundle; the wait
    // that follows is measured in blocks, so the fetch costs nothing next to
    // it. Same pattern as useSafeDetection.js.
    const { default: SafeApiKit } = await import('@safe-global/api-kit');

    const apiKit = new SafeApiKit({
        chainId,
        txServiceUrl,
    });

    const start = Date.now();
    let lastSafeTx = null;

    onStatus?.({
        status: 'POLLING_SAFE_API',
        message: 'Checking Safe Transaction Service...',
        safeTxHash
    });

    while (Date.now() - start < timeoutMs) {
        try {
            // 1) Ask Safe for info about this safeTxHash
            const safeTx = await apiKit.getTransaction(safeTxHash);
            lastSafeTx = safeTx;

            console.log(`[waitForSafeTxReceipt] Polling Safe API for ${safeTxHash}. Executed: ${safeTx.isExecuted}. Viem wait bypassed.`);

            // When executed, Safe fills in `transactionHash` (the normal Ethereum tx hash)
            if (safeTx.transactionHash) {
                const realHash = safeTx.transactionHash;

                onStatus?.({
                    status: 'EXECUTED_ON_CHAIN',
                    message: 'Safe transaction executed! Waiting for block confirmation...',
                    safeTxHash,
                    txHash: realHash
                });

                // 2) Now wait on-chain using viem
                const receipt = await publicClient.waitForTransactionReceipt({ hash: realHash });

                onStatus?.({
                    status: 'CONFIRMED',
                    message: 'Transaction confirmed on-chain.',
                    safeTxHash,
                    txHash: realHash,
                    receipt
                });

                return receipt;
            } else {
                onStatus?.({
                    status: 'PENDING_EXECUTION',
                    message: `Safe transaction pending. Confirmations: ${safeTx.confirmations?.length || 0}/${safeTx.confirmationsRequired}`,
                    safeTxHash,
                    confirmations: safeTx.confirmations?.length || 0,
                    required: safeTx.confirmationsRequired
                });
            }

            // Not executed yet → wait & retry
        } catch (err) {
            // Before indexing, Safe API can 404 – ignore and retry
            if (err?.response?.status !== 404) {
                throw err;
            }
            onStatus?.({
                status: 'WAITING_FOR_INDEXING',
                message: 'Waiting for Safe service to index transaction...',
                safeTxHash
            });
        }

        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    const reason = lastSafeTx?.isExecuted === false
        ? 'Safe tx still pending (needs confirmations / execution).'
        : 'Safe tx not indexed / not executed.';
    throw new Error(`Timed out waiting for Safe transaction: ${reason}`);
}
