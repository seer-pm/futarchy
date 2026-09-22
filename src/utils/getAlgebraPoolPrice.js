import { ethers } from "ethers";

// List of reliable Gnosis Chain RPC endpoints
// A private endpoint from NEXT_PUBLIC_RPC_URL is tried first; the public
// ones stay behind it as fallbacks.
const GNOSIS_RPCS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  "https://rpc.ankr.com/gnosis",
  "https://gnosis.drpc.org",
  "https://gnosis-rpc.publicnode.com",
  "https://1rpc.io/gnosis"
].filter(Boolean);

// Track current RPC index and failed RPCs
let currentRpcIndex = 0;
const failedRpcs = new Set();

// Mock mode for testing - set to true to avoid RPC calls
const MOCK_MODE = false;

const POOL_ABI = [
  {
    name: "globalState",
    outputs: [
      { type: "uint160", name: "price" }, // sqrtPriceX96
      { type: "int24", name: "tick" },
      { type: "uint16", name: "lastFee" },
      { type: "uint8", name: "pluginConfig" },
      { type: "uint16", name: "communityFee" },
      { type: "bool", name: "unlocked" },
    ],
    inputs: [],
    stateMutability: "view",
    type: "function",
  },
];

// Provider instances for each RPC
const providers = new Map();

// Map to store pool contract instances by RPC + address
const poolContracts = new Map();

// Track loading states to prevent duplicate requests
const loadingStates = new Map();

// Track retry states to prevent multiple retries
const retryStates = new Map();

// Track rate limit cooldowns per RPC
const rateLimitCooldowns = new Map();

const CACHE_DURATION = 30 * 1000; // 30 seconds in milliseconds
const BASE_RETRY_DELAY = 30 * 1000; // 30 seconds base delay
const RANDOM_RETRY_RANGE = 10 * 1000; // 1-10 seconds additional random delay

// Get or create provider for given RPC URL
function getProvider(rpcUrl) {
  if (!providers.has(rpcUrl)) {
    console.log("[PROVIDER] Creating new provider for:", rpcUrl);
    providers.set(rpcUrl, new ethers.providers.JsonRpcProvider(rpcUrl));
  }
  return providers.get(rpcUrl);
}

// Get next available RPC (skip failed ones temporarily)
function getNextRpc() {
  const startIndex = currentRpcIndex;
  
  do {
    const rpc = GNOSIS_RPCS[currentRpcIndex];
    const rpcKey = `${rpc}`;
    
    // Check if this RPC is in cooldown
    const cooldownUntil = rateLimitCooldowns.get(rpcKey);
    if (!cooldownUntil || Date.now() >= cooldownUntil) {
      console.log("[RPC SELECT] Using RPC:", rpc, "Index:", currentRpcIndex);
      return { url: rpc, index: currentRpcIndex };
    }
    
    // Try next RPC
    currentRpcIndex = (currentRpcIndex + 1) % GNOSIS_RPCS.length;
  } while (currentRpcIndex !== startIndex);
  
  // All RPCs are in cooldown, use the original one anyway
  console.log("[RPC FALLBACK] All RPCs in cooldown, using index:", currentRpcIndex);
  return { url: GNOSIS_RPCS[currentRpcIndex], index: currentRpcIndex };
}

// Mark RPC as failed and rotate to next
function rotateRpc(failedRpcUrl, error) {
  console.log("[RPC ROTATE] RPC failed:", failedRpcUrl, "Error:", error.message);
  
  // Set cooldown for this specific RPC
  const randomDelay = Math.floor(Math.random() * RANDOM_RETRY_RANGE) + 1000;
  const totalDelay = BASE_RETRY_DELAY + randomDelay;
  const cooldownUntil = Date.now() + totalDelay;
  
  rateLimitCooldowns.set(failedRpcUrl, cooldownUntil);
  console.log(`[RPC COOLDOWN] RPC ${failedRpcUrl} in cooldown for ${Math.ceil(totalDelay / 1000)}s`);
  
  // Move to next RPC
  currentRpcIndex = (currentRpcIndex + 1) % GNOSIS_RPCS.length;
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

// Wait for rate limit cooldown
async function waitForCooldown(address) {
  const cooldownUntil = rateLimitCooldowns.get(address);
  if (cooldownUntil && Date.now() < cooldownUntil) {
    const waitTime = cooldownUntil - Date.now();
    console.log(`[RATE LIMIT] Waiting ${Math.ceil(waitTime / 1000)}s for cooldown on pool:`, address);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

// Set rate limit cooldown with random delay
function setRateLimitCooldown(address) {
  const randomDelay = Math.floor(Math.random() * RANDOM_RETRY_RANGE) + 1000; // 1-10 seconds
  const totalDelay = BASE_RETRY_DELAY + randomDelay;
  const cooldownUntil = Date.now() + totalDelay;
  
  rateLimitCooldowns.set(address, cooldownUntil);
  console.log(`[RATE LIMIT] Setting cooldown for ${Math.ceil(totalDelay / 1000)}s on pool:`, address);
}

// Try to call with RPC fallback
async function callWithRpcFallback(address, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { url: rpcUrl, index: rpcIndex } = getNextRpc();
    const provider = getProvider(rpcUrl);
    
    // Get or create pool contract for this RPC
    const contractKey = `${rpcUrl}:${address}`;
    let pool = poolContracts.get(contractKey);
    if (!pool) {
      pool = new ethers.Contract(address, POOL_ABI, provider);
      poolContracts.set(contractKey, pool);
    }
    
    try {
      console.log(`[RPC ATTEMPT ${attempt + 1}] Calling pool ${address} via RPC ${rpcIndex}:`, rpcUrl);
      const globalState = await pool.globalState();
      const sqrtPriceX96 = globalState.price;
      const price = (Number(sqrtPriceX96) ** 2) / 2 ** 192;
      
      console.log(`[RPC SUCCESS] Got price ${price} from RPC ${rpcIndex}:`, rpcUrl);
      return price;
      
    } catch (error) {
      console.log(`[RPC ERROR] Attempt ${attempt + 1} failed for RPC ${rpcIndex}:`, error.message);
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

// Returns the price of token0 in terms of token1
export async function getAlgebraPoolPrice(poolConfig) {
  const address = poolConfig.address;
  console.log("[CALL START] getAlgebraPoolPrice called for pool:", address);
  
  // IMMEDIATE deduplication - check all states first before doing ANYTHING
  if (loadingStates.has(address)) {
    console.log("[EARLY DEDUP] Already loading pool:", address);
    return await loadingStates.get(address);
  }
  
  if (retryStates.has(address)) {
    console.log("[EARLY RETRY DEDUP] Already retrying pool:", address);
    return await retryStates.get(address);
  }
  
  const now = Date.now();
  
  // Check if we're in a rate limit cooldown
  const cooldownUntil = rateLimitCooldowns.get(address);
  if (cooldownUntil && now < cooldownUntil) {
    const waitTime = cooldownUntil - now;
    console.log(`[COOLDOWN ACTIVE] Pool ${address} is in cooldown for ${Math.ceil(waitTime / 1000)}s more`);
    
    // If already in cooldown, don't make any new requests
    if (poolConfig.price && poolConfig.priceTimestamp) {
      console.log("[COOLDOWN CACHE] Using stale cache during cooldown for pool:", address);
      return poolConfig.price;
    }
    
    // If no cache, wait for cooldown and then try (but only one caller should do this)
    if (!retryStates.has(address)) {
      const cooldownRetryPromise = (async () => {
        try {
          await waitForCooldown(address);
          console.log("[COOLDOWN RETRY] Retrying after cooldown for pool:", address);
          return await getAlgebraPoolPrice(poolConfig); // Recursive call after cooldown
        } finally {
          retryStates.delete(address);
        }
      })();
      
      retryStates.set(address, cooldownRetryPromise);
      return await cooldownRetryPromise;
    } else {
      console.log("[COOLDOWN WAIT] Waiting for existing cooldown retry for pool:", address);
      return await retryStates.get(address);
    }
  }
  
  // Check if poolConfig already has a recent price
  if (poolConfig.price && poolConfig.priceTimestamp) {
    if (now - poolConfig.priceTimestamp < CACHE_DURATION) {
      console.log("[CACHE HIT] Using cached price for pool:", address, "Price:", poolConfig.price);
      return poolConfig.price;
    } else {
      console.log("[CACHE EXPIRED] Cache expired for pool:", address, "Age:", (now - poolConfig.priceTimestamp) / 1000, "seconds");
    }
  } else {
    console.log("[CACHE MISS] No cached price for pool:", address);
  }

  // Mock mode - return test data without RPC calls but still test caching
  if (MOCK_MODE) {
    console.log("[MOCK MODE] Simulating RPC call for pool:", address);
    
    // Create promise for this request and store it
    const loadingPromise = (async () => {
      try {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const mockPrice = 0.98765 + Math.random() * 0.02; // Slight variation for testing
        
        // Cache the result in poolConfig
        poolConfig.price = mockPrice;
        poolConfig.priceTimestamp = now;
        
        console.log("[MOCK COMPLETE] Cached mock price:", mockPrice, "for pool:", address);
        return mockPrice;
      } finally {
        // Remove from loading states when done
        loadingStates.delete(address);
      }
    })();
    
    // Store the promise so other calls can wait for it
    loadingStates.set(address, loadingPromise);
    
    return await loadingPromise;
  }

  console.log("[RPC START] Making RPC call for pool:", address);
  
  // Create promise for this request and store it IMMEDIATELY
  const loadingPromise = (async () => {
    try {
      // Try multiple RPCs if needed
      const price = await callWithRpcFallback(address);
      
      // Cache the result in poolConfig
      poolConfig.price = price;
      poolConfig.priceTimestamp = now;
      
      // Clear any rate limit cooldown on success
      rateLimitCooldowns.delete(address);
      
      console.log("[RPC SUCCESS] Got price:", price, "for pool:", address);
      return price;
    } catch (error) {
      console.log("[RPC ERROR] All RPCs failed for pool:", address, error.message);
      
      // Check if it's a rate limit error
      if (isRateLimitError(error)) {
        console.log("[RATE LIMIT DETECTED] Setting cooldown for pool:", address);
        setRateLimitCooldown(address);
      }
      
      // Throw the error - cooldown logic will handle retries on subsequent calls
      throw error;
    } finally {
      // Always remove from loading states when done
      console.log("[CLEANUP] Removing loading state for pool:", address);
      loadingStates.delete(address);
    }
  })();
  
  // Store the promise so other calls can wait for it
  loadingStates.set(address, loadingPromise);
  
  return await loadingPromise;
}
