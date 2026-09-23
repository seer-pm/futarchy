// src/hooks/useSdaiRate.js
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { RPC_ENDPOINTS, RPC_NETWORKS } from '../config/rpcEndpoints';
import {
    SDAI_CONTRACT_RATE,
    SDAI_RATE_PROVIDER_ABI,
    BASE_TOKENS_CONFIG as DEFAULT_BASE_TOKENS_CONFIG
} from '../components/futarchyFi/marketPage/constants/contracts';

// Endpoints come from config/rpcEndpoints.js. This module keeps its own
// rotation because it tracks endpoints that have failed.
const GNOSIS_RPCS = RPC_ENDPOINTS[100];

const REFRESH_INTERVAL = 60000; // Refresh rate every 60 seconds
const TIMEOUT_DURATION = 15000; // 15 second timeout for contract call
const BASE_RETRY_DELAY = 30 * 1000; // 30 seconds base delay
const RANDOM_RETRY_RANGE = 10 * 1000; // 1-10 seconds additional random delay

// Provider instances for each RPC
const providers = new Map();
let currentRpcIndex = 0;
const rateLimitCooldowns = new Map();

// Get or create provider for given RPC URL
function getProvider(rpcUrl) {
  if (!providers.has(rpcUrl)) {
    console.log("[SDAI PROVIDER] Creating new provider for:", rpcUrl);
    // Stating the network skips ethers' eth_chainId detection call.
    providers.set(rpcUrl, new ethers.providers.JsonRpcBatchProvider(rpcUrl, RPC_NETWORKS[100]));
  }
  return providers.get(rpcUrl);
}

// Get next available RPC (skip failed ones temporarily)
function getNextRpc() {
  const startIndex = currentRpcIndex;
  
  do {
    const rpc = GNOSIS_RPCS[currentRpcIndex];
    
    // Check if this RPC is in cooldown
    const cooldownUntil = rateLimitCooldowns.get(rpc);
    if (!cooldownUntil || Date.now() >= cooldownUntil) {
      console.log("[SDAI RPC SELECT] Using RPC:", rpc, "Index:", currentRpcIndex);
      return { url: rpc, index: currentRpcIndex };
    }
    
    // Try next RPC
    currentRpcIndex = (currentRpcIndex + 1) % GNOSIS_RPCS.length;
  } while (currentRpcIndex !== startIndex);
  
  // All RPCs are in cooldown, use the original one anyway
  console.log("[SDAI RPC FALLBACK] All RPCs in cooldown, using index:", currentRpcIndex);
  return { url: GNOSIS_RPCS[currentRpcIndex], index: currentRpcIndex };
}

// Check if error is rate limit or CORS related
function isRateLimitError(error) {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code;
  
  return (
    errorCode === 429 ||
    errorMessage.includes('429') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('cors') ||
    errorMessage.includes('too many requests') ||
    errorMessage.includes('network error') ||
    errorMessage.includes('fetch')
  );
}

// Mark RPC as failed and rotate to next
function rotateRpc(failedRpcUrl, error) {
  console.log("[SDAI RPC ROTATE] RPC failed:", failedRpcUrl, "Error:", error.message);
  
  // Set cooldown for this specific RPC
  const randomDelay = Math.floor(Math.random() * RANDOM_RETRY_RANGE) + 1000;
  const totalDelay = BASE_RETRY_DELAY + randomDelay;
  const cooldownUntil = Date.now() + totalDelay;
  
  rateLimitCooldowns.set(failedRpcUrl, cooldownUntil);
  console.log(`[SDAI RPC COOLDOWN] RPC ${failedRpcUrl} in cooldown for ${Math.ceil(totalDelay / 1000)}s`);
  
  // Move to next RPC
  currentRpcIndex = (currentRpcIndex + 1) % GNOSIS_RPCS.length;
}

// Try to fetch SDAI rate with RPC fallback
async function fetchSdaiRateWithFallback(maxRetries = 3) {
  const currencyDecimals = DEFAULT_BASE_TOKENS_CONFIG?.currency?.decimals ?? 18;
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { url: rpcUrl, index: rpcIndex } = getNextRpc();
    const provider = getProvider(rpcUrl);
    
    try {
      console.log(`[SDAI ATTEMPT ${attempt + 1}] Fetching sDAI rate via RPC ${rpcIndex}:`, rpcUrl);
      
      const sdaiRateContract = new ethers.Contract(
        SDAI_CONTRACT_RATE,
        SDAI_RATE_PROVIDER_ABI,
        provider
      );
      
      const rateRaw = await Promise.race([
        sdaiRateContract.getRate(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`sDAI getRate timeout after ${TIMEOUT_DURATION / 1000} seconds`)), TIMEOUT_DURATION)
        )
      ]);
      
      const formattedRate = Number(ethers.utils.formatUnits(rateRaw, currencyDecimals));
      console.log(`[SDAI SUCCESS] Got rate ${formattedRate} from RPC ${rpcIndex}:`, rpcUrl);
      return formattedRate;
      
    } catch (error) {
      console.log(`[SDAI ERROR] Attempt ${attempt + 1} failed for RPC ${rpcIndex}:`, error.message);
      lastError = error;
      
      if (isRateLimitError(error)) {
        rotateRpc(rpcUrl, error);
        // Continue to next RPC
      } else {
        // For non-rate-limit errors, still try next RPC but don't set cooldown
        currentRpcIndex = (currentRpcIndex + 1) % GNOSIS_RPCS.length;
      }
    }
  }
  
  // All RPCs failed
  throw lastError;
}

export const useSdaiRate = () => {
    const [rate, setRate] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!SDAI_CONTRACT_RATE || !SDAI_RATE_PROVIDER_ABI) {
            console.warn('useSdaiRate: Missing contract config.');
            setError('Missing contract config');
            return;
        }

        const fetchRate = async () => {
            setIsLoading(true);
            setError(null);
            try {
                console.log('useSdaiRate: Fetching sDAI rate with RPC fallback...');
                const formattedRate = await fetchSdaiRateWithFallback();
                console.log('useSdaiRate: Fetched and formatted rate:', formattedRate);
                setRate(formattedRate);

            } catch (err) {
                console.error("useSdaiRate: All RPCs failed for SDAI rate:", err);
                setError(err.message || 'Failed to fetch sDAI rate');
                setRate(null); // Clear rate on error
            } finally {
                setIsLoading(false);
            }
        };

        fetchRate(); // Initial fetch

        // Set up interval for refreshing
        const intervalId = setInterval(fetchRate, REFRESH_INTERVAL);

        // Cleanup function to clear interval when component unmounts
        return () => clearInterval(intervalId);

    }, []); // No dependencies since we're using static config and RPC rotation

    return { rate, isLoading, error };
}; 