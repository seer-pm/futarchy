/**
 * Static + batching JSON-RPC provider (ethers v5).
 *
 * ethers offers these two behaviours separately and we want both:
 *
 *   - `JsonRpcBatchProvider` coalesces calls made in the same tick into one
 *     POST, but inherits `JsonRpcProvider.detectNetwork()`, which asks the
 *     endpoint for its chain id again and again. Passing a network to the
 *     constructor does not stop it.
 *   - `StaticJsonRpcProvider` stops that by answering `detectNetwork()` from
 *     the network it was constructed with, but does not batch.
 *
 * This is StaticJsonRpcProvider's override applied to the batch provider, so
 * a configured chain costs zero eth_chainId requests and its reads share
 * POSTs.
 */

import { ethers } from 'ethers';

export class StaticJsonRpcBatchProvider extends ethers.providers.JsonRpcBatchProvider {
    async detectNetwork() {
        let network = this.network;
        if (network == null) {
            network = await super.detectNetwork();
            if (!network) {
                throw new Error('No network detected');
            }
            if (this._network == null) {
                // Matches ethers' own StaticJsonRpcProvider: set the network
                // without going through the "network changed" event.
                ethers.utils.defineReadOnly(this, '_network', network);
                this.emit('network', network, null);
            }
        }
        return network;
    }
}

/**
 * @param {string} url
 * @param {{chainId: number, name: string}} network - stated, never detected
 */
export function createStaticBatchProvider(url, network) {
    const provider = new StaticJsonRpcBatchProvider(url, network);
    // Nothing here subscribes to blocks; keep any incidental polling rare.
    provider.pollingInterval = 60_000;
    return provider;
}

export default createStaticBatchProvider;
