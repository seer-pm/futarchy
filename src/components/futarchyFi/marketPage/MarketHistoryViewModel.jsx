import React from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ethers } from 'ethers';
import { RPC_ENDPOINTS, RPC_NETWORKS } from '../../../config/rpcEndpoints';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);


// Endpoints come from config/rpcEndpoints.js. This module keeps its own
// rotation because it also tracks per-endpoint rate-limit cooldowns.
const GNOSIS_RPCS = RPC_ENDPOINTS[100];

// RPC fallback system variables
const providers = new Map();
let currentRpcIndex = 0;
const rateLimitCooldowns = new Map();
const BASE_RETRY_DELAY = 30 * 1000; // 30 seconds
const RANDOM_RETRY_RANGE = 10 * 1000; // 1-10 seconds

// Get or create provider for given RPC URL
function getProvider(rpcUrl) {
  if (!providers.has(rpcUrl)) {
    console.log("[HISTORY PROVIDER] Creating new provider for:", rpcUrl);
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
      console.log("[HISTORY RPC SELECT] Using RPC:", rpc, "Index:", currentRpcIndex);
      return { url: rpc, index: currentRpcIndex };
    }

    // Try next RPC
    currentRpcIndex = (currentRpcIndex + 1) % GNOSIS_RPCS.length;
  } while (currentRpcIndex !== startIndex);

  // All RPCs are in cooldown, use the original one anyway
  console.log("[HISTORY RPC FALLBACK] All RPCs in cooldown, using index:", currentRpcIndex);
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
  console.log("[HISTORY RPC ROTATE] RPC failed:", failedRpcUrl, "Error:", error.message);

  // Set cooldown for this specific RPC
  const randomDelay = Math.floor(Math.random() * RANDOM_RETRY_RANGE) + 1000;
  const totalDelay = BASE_RETRY_DELAY + randomDelay;
  const cooldownUntil = Date.now() + totalDelay;

  rateLimitCooldowns.set(failedRpcUrl, cooldownUntil);
  console.log(`[HISTORY RPC COOLDOWN] RPC ${failedRpcUrl} in cooldown for ${Math.ceil(totalDelay / 1000)}s`);

  // Move to next RPC
  currentRpcIndex = (currentRpcIndex + 1) % GNOSIS_RPCS.length;
}

// Token symbol cache and fetching - now enhanced with contract config
const tokenSymbolCache = new Map();

// Pre-warm cache with known common tokens to avoid RPC calls
const COMMON_TOKENS = {
  '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d': 'WXDAI', // Wrapped xDAI
  '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb': 'GNO',   // Gnosis Token
  '0xaf204776c7245bf4147c2612bf6e5972ee483701': 'sDAI',  // Savings DAI
  // Add more common tokens as needed
};

// Initialize cache with common tokens
Object.entries(COMMON_TOKENS).forEach(([address, symbol]) => {
  tokenSymbolCache.set(address.toLowerCase(), symbol);
});

// Function to populate token symbol cache from contract config
function populateTokenCacheFromConfig(config) {
  if (!config) {
    console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: No config provided to populateTokenCacheFromConfig`);
    return;
  }

  console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ GUARANTEED CONTRACT CONFIG USAGE - Starting token cache population`);
  const tokenMappings = {};

  // Check for new metadata structure (companyTokens, currencyTokens)
  if (config.metadata?.companyTokens && config.metadata?.currencyTokens) {
    console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Found new metadata structure with companyTokens and currencyTokens`);

    // Add company tokens (TSLAon, YES_TSLAon, NO_TSLAon)
    const companyTokens = config.metadata.companyTokens;
    if (companyTokens.base?.wrappedCollateralTokenAddress && companyTokens.base?.tokenSymbol) {
      tokenMappings[companyTokens.base.wrappedCollateralTokenAddress.toLowerCase()] = companyTokens.base.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added base company token: ${companyTokens.base.wrappedCollateralTokenAddress} -> ${companyTokens.base.tokenSymbol}`);
    }
    if (companyTokens.yes?.wrappedCollateralTokenAddress && companyTokens.yes?.tokenSymbol) {
      tokenMappings[companyTokens.yes.wrappedCollateralTokenAddress.toLowerCase()] = companyTokens.yes.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added YES company token: ${companyTokens.yes.wrappedCollateralTokenAddress} -> ${companyTokens.yes.tokenSymbol}`);
    }
    if (companyTokens.no?.wrappedCollateralTokenAddress && companyTokens.no?.tokenSymbol) {
      tokenMappings[companyTokens.no.wrappedCollateralTokenAddress.toLowerCase()] = companyTokens.no.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added NO company token: ${companyTokens.no.wrappedCollateralTokenAddress} -> ${companyTokens.no.tokenSymbol}`);
    }

    // Add currency tokens (USDS, YES_USDS, NO_USDS)
    const currencyTokens = config.metadata.currencyTokens;
    if (currencyTokens.base?.wrappedCollateralTokenAddress && currencyTokens.base?.tokenSymbol) {
      tokenMappings[currencyTokens.base.wrappedCollateralTokenAddress.toLowerCase()] = currencyTokens.base.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added base currency token: ${currencyTokens.base.wrappedCollateralTokenAddress} -> ${currencyTokens.base.tokenSymbol}`);
    }
    if (currencyTokens.yes?.wrappedCollateralTokenAddress && currencyTokens.yes?.tokenSymbol) {
      tokenMappings[currencyTokens.yes.wrappedCollateralTokenAddress.toLowerCase()] = currencyTokens.yes.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added YES currency token: ${currencyTokens.yes.wrappedCollateralTokenAddress} -> ${currencyTokens.yes.tokenSymbol}`);
    }
    if (currencyTokens.no?.wrappedCollateralTokenAddress && currencyTokens.no?.tokenSymbol) {
      tokenMappings[currencyTokens.no.wrappedCollateralTokenAddress.toLowerCase()] = currencyTokens.no.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added NO currency token: ${currencyTokens.no.wrappedCollateralTokenAddress} -> ${currencyTokens.no.tokenSymbol}`);
    }
  }

  // Fallback: Add base tokens (for older config structure)
  if (config.BASE_TOKENS_CONFIG) {
    console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Found BASE_TOKENS_CONFIG (fallback)`);
    const { currency, company } = config.BASE_TOKENS_CONFIG;
    if (currency?.address && currency?.symbol) {
      tokenMappings[currency.address.toLowerCase()] = currency.symbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added base currency token: ${currency.address} -> ${currency.symbol}`);
    }
    if (company?.address && company?.symbol) {
      tokenMappings[company.address.toLowerCase()] = company.symbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added base company token: ${company.address} -> ${company.symbol}`);
    }
  }

  // Fallback: Add wrapped conditional tokens from MERGE_CONFIG (for older config structure)
  if (config.MERGE_CONFIG) {
    console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Found MERGE_CONFIG (fallback)`);
    const { currencyPositions, companyPositions } = config.MERGE_CONFIG;

    // Currency positions (YES/NO sDAI)
    if (currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress && currencyPositions?.yes?.wrap?.tokenSymbol) {
      tokenMappings[currencyPositions.yes.wrap.wrappedCollateralTokenAddress.toLowerCase()] = currencyPositions.yes.wrap.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added YES currency token: ${currencyPositions.yes.wrap.wrappedCollateralTokenAddress} -> ${currencyPositions.yes.wrap.tokenSymbol}`);
    }
    if (currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress && currencyPositions?.no?.wrap?.tokenSymbol) {
      tokenMappings[currencyPositions.no.wrap.wrappedCollateralTokenAddress.toLowerCase()] = currencyPositions.no.wrap.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added NO currency token: ${currencyPositions.no.wrap.wrappedCollateralTokenAddress} -> ${currencyPositions.no.wrap.tokenSymbol}`);
    }

    // Company positions (YES/NO GNO)
    if (companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress && companyPositions?.yes?.wrap?.tokenSymbol) {
      tokenMappings[companyPositions.yes.wrap.wrappedCollateralTokenAddress.toLowerCase()] = companyPositions.yes.wrap.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added YES company token: ${companyPositions.yes.wrap.wrappedCollateralTokenAddress} -> ${companyPositions.yes.wrap.tokenSymbol}`);
    }
    if (companyPositions?.no?.wrap?.wrappedCollateralTokenAddress && companyPositions?.no?.wrap?.tokenSymbol) {
      tokenMappings[companyPositions.no.wrap.wrappedCollateralTokenAddress.toLowerCase()] = companyPositions.no.wrap.tokenSymbol;
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: Added NO company token: ${companyPositions.no.wrap.wrappedCollateralTokenAddress} -> ${companyPositions.no.wrap.tokenSymbol}`);
    }
  }

  // Update cache with contract config tokens
  Object.entries(tokenMappings).forEach(([address, symbol]) => {
    tokenSymbolCache.set(address, symbol);
  });

  console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ GUARANTEED - Populated token cache with ${Object.keys(tokenMappings).length} tokens from contract config:`, tokenMappings);
}

console.log(`[TRADE_HISTORY_DEBUG] 🚀 INIT: Pre-warmed token cache with ${Object.keys(COMMON_TOKENS).length} common tokens:`, COMMON_TOKENS);



const BASE_COMPANY_SYMBOL = 'GNO';
// Default fallback symbol
const DEFAULT_CURRENCY_SYMBOL = 'sDAI';
const GNOSIS_RPC_URL = process.env.NEXT_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com';

// Default pools - will be overridden by dynamic config
const DEFAULT_POOLS_TO_QUERY = [
  { address: '0xac12a0c39266E0214cdbcEE98c53cC13E5722B8A', name: 'YES/YES Pool (GNO/sDAI)' },
  { address: '0x18DcF3B948B3c0B34e30392576f55c8815F11a96', name: 'NO/NO Pool (GNO/sDAI)' },
  { address: '0x67750A4c9E8d4987286DF84d351bAE8fC9EeF865', name: 'Prediction YES Pool (e.g., YES_sDAI/sDAI)' },
];

// Function to get dynamic pools from config
const getPoolsToQuery = (config) => {
  if (!config) return DEFAULT_POOLS_TO_QUERY;

  return [
    {
      address: config.POOL_CONFIG_YES?.address || config.PREDICTION_POOLS?.yes?.address || DEFAULT_POOLS_TO_QUERY[0].address,
      name: 'YES Pool (Dynamic)'
    },
    {
      address: config.POOL_CONFIG_NO?.address || config.PREDICTION_POOLS?.no?.address || DEFAULT_POOLS_TO_QUERY[1].address,
      name: 'NO Pool (Dynamic)'
    },
    {
      address: config.POOL_CONFIG_THIRD?.address || DEFAULT_POOLS_TO_QUERY[2].address,
      name: 'Third Pool (Dynamic)'
    },
  ];
};

const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "name": "",
        "type": "string"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

const formatTimestampForViewModel = (timestamp) => {
  // Matches the format from getTradeHistory.js output: "2025-05-14 15:24:15.000 UTC"
  return dayjs(timestamp).utc().format('YYYY-MM-DD HH:mm:ss.SSS [UTC]');
};

function parseTokenSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return { prefix: null, base: null, original: symbol };
  const parts = symbol.split('_');
  if (parts.length >= 2) {
    return { prefix: parts[0], base: parts[1], original: symbol };
  }
  return { prefix: null, base: symbol, original: symbol };
}

// Helper function to safely convert values to BigNumber, handling scientific notation
function safeBigNumberFrom(value) {
  try {
    if (!value && value !== 0) {
      return ethers.BigNumber.from('0');
    }

    // Convert to string first
    const stringValue = String(value);

    // Check if it's in scientific notation
    if (stringValue.toLowerCase().includes('e')) {
      // Convert scientific notation to decimal string
      const numValue = Number(stringValue);
      if (isNaN(numValue) || !isFinite(numValue)) {
        console.warn(`[TRADE_HISTORY_DEBUG] Invalid number value: ${stringValue}, defaulting to 0`);
        return ethers.BigNumber.from('0');
      }

      // Convert to integer string (remove decimals for wei amounts)
      const integerValue = Math.floor(Math.abs(numValue));
      const sign = numValue < 0 ? '-' : '';
      const safeString = sign + integerValue.toString();

      console.log(`[TRADE_HISTORY_DEBUG] Converted scientific notation: ${stringValue} -> ${safeString}`);
      return ethers.BigNumber.from(safeString);
    }

    // Handle decimal numbers
    if (stringValue.includes('.')) {
      const numValue = Number(stringValue);
      if (isNaN(numValue) || !isFinite(numValue)) {
        console.warn(`[TRADE_HISTORY_DEBUG] Invalid decimal value: ${stringValue}, defaulting to 0`);
        return ethers.BigNumber.from('0');
      }

      // Convert to integer (remove decimals for wei amounts)
      const integerValue = Math.floor(Math.abs(numValue));
      const sign = numValue < 0 ? '-' : '';
      const safeString = sign + integerValue.toString();

      console.log(`[TRADE_HISTORY_DEBUG] Converted decimal: ${stringValue} -> ${safeString}`);
      return ethers.BigNumber.from(safeString);
    }

    // Should be a safe integer string already
    return ethers.BigNumber.from(stringValue);

  } catch (error) {
    console.error(`[TRADE_HISTORY_DEBUG] Error converting ${value} to BigNumber:`, error);
    console.warn(`[TRADE_HISTORY_DEBUG] Defaulting to BigNumber.from('0') for value: ${value}`);
    return ethers.BigNumber.from('0');
  }
}

// Try to fetch token symbol with RPC fallback
async function getTokenSymbolWithFallback(tokenAddress, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { url: rpcUrl, index: rpcIndex } = getNextRpc();
    const provider = getProvider(rpcUrl);

    try {
      console.log(`[HISTORY TOKEN ATTEMPT ${attempt + 1}] Fetching symbol for ${tokenAddress} via RPC ${rpcIndex}:`, rpcUrl);

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const symbol = await tokenContract.symbol();

      console.log(`[HISTORY TOKEN SUCCESS] Got symbol ${symbol} for ${tokenAddress} from RPC ${rpcIndex}:`, rpcUrl);
      return symbol;

    } catch (error) {
      console.log(`[HISTORY TOKEN ERROR] Attempt ${attempt + 1} failed for RPC ${rpcIndex}:`, error.message);
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

// Function to get token symbol with caching and contract config priority
async function getTokenSymbol(tokenAddress, config = null) {
  const normalizedAddress = tokenAddress?.toLowerCase();

  if (tokenSymbolCache.has(normalizedAddress)) {
    const cachedSymbol = tokenSymbolCache.get(normalizedAddress);
    console.log(`[TRADE_HISTORY_DEBUG] 💾 CACHE: Cache hit for ${normalizedAddress}: ${cachedSymbol}`);
    return cachedSymbol;
  }

  // Try to get from contract config first (avoid RPC calls)
  if (config) {
    console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ GUARANTEED - Attempting config lookup for ${normalizedAddress}`);
    const configSymbol = getTokenSymbolFromConfig(normalizedAddress, config);
    if (configSymbol) {
      tokenSymbolCache.set(normalizedAddress, configSymbol);
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ GUARANTEED SUCCESS - Found symbol for ${normalizedAddress} in contract config: ${configSymbol} (NO RPC CALL NEEDED)`);
      return configSymbol;
    }
    console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ❌ Token ${normalizedAddress} not found in contract config, falling back to RPC`);
  } else {
    console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ❌ No contract config available for ${normalizedAddress}, falling back to RPC`);
  }

  try {
    console.log(`[TRADE_HISTORY_DEBUG] 🌐 RPC: ⚠️ FALLBACK - Fetching symbol for ${normalizedAddress} via RPC (config lookup failed)`);
    const rpcStartTime = performance.now();
    const symbol = await getTokenSymbolWithFallback(normalizedAddress);
    const rpcEndTime = performance.now();

    tokenSymbolCache.set(normalizedAddress, symbol);
    console.log(`[TRADE_HISTORY_DEBUG] ✅ RPC: Fetched and cached symbol for ${normalizedAddress}: ${symbol}. Time: ${(rpcEndTime - rpcStartTime).toFixed(2)}ms`);
    return symbol;
  } catch (error) {
    console.error(`[TRADE_HISTORY_DEBUG] ❌ RPC: Error fetching symbol for token ${normalizedAddress}:`, error.message);
    tokenSymbolCache.set(normalizedAddress, null); // Cache null on error
    return null;
  }
}

// Helper function to get token symbol from contract config
function getTokenSymbolFromConfig(tokenAddress, config) {
  if (!config || !tokenAddress) {
    console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: getTokenSymbolFromConfig called with invalid params - config: ${!!config}, tokenAddress: ${!!tokenAddress}`);
    return null;
  }

  const normalizedAddress = tokenAddress.toLowerCase();
  console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ GUARANTEED CONFIG LOOKUP for token: ${normalizedAddress}`);

  // Check new metadata structure first (companyTokens, currencyTokens)
  if (config.metadata?.companyTokens && config.metadata?.currencyTokens) {
    const companyTokens = config.metadata.companyTokens;
    const currencyTokens = config.metadata.currencyTokens;

    // Check company tokens
    if (companyTokens.base?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in metadata.companyTokens.base: ${normalizedAddress} -> ${companyTokens.base.tokenSymbol}`);
      return companyTokens.base.tokenSymbol;
    }
    if (companyTokens.yes?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in metadata.companyTokens.yes: ${normalizedAddress} -> ${companyTokens.yes.tokenSymbol}`);
      return companyTokens.yes.tokenSymbol;
    }
    if (companyTokens.no?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in metadata.companyTokens.no: ${normalizedAddress} -> ${companyTokens.no.tokenSymbol}`);
      return companyTokens.no.tokenSymbol;
    }

    // Check currency tokens
    if (currencyTokens.base?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in metadata.currencyTokens.base: ${normalizedAddress} -> ${currencyTokens.base.tokenSymbol}`);
      return currencyTokens.base.tokenSymbol;
    }
    if (currencyTokens.yes?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in metadata.currencyTokens.yes: ${normalizedAddress} -> ${currencyTokens.yes.tokenSymbol}`);
      return currencyTokens.yes.tokenSymbol;
    }
    if (currencyTokens.no?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in metadata.currencyTokens.no: ${normalizedAddress} -> ${currencyTokens.no.tokenSymbol}`);
      return currencyTokens.no.tokenSymbol;
    }
  }

  // Fallback: Check base tokens (older structure)
  if (config.BASE_TOKENS_CONFIG) {
    if (config.BASE_TOKENS_CONFIG.currency?.address?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in BASE_TOKENS_CONFIG.currency: ${normalizedAddress} -> ${config.BASE_TOKENS_CONFIG.currency.symbol}`);
      return config.BASE_TOKENS_CONFIG.currency.symbol;
    }
    if (config.BASE_TOKENS_CONFIG.company?.address?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in BASE_TOKENS_CONFIG.company: ${normalizedAddress} -> ${config.BASE_TOKENS_CONFIG.company.symbol}`);
      return config.BASE_TOKENS_CONFIG.company.symbol;
    }
  }

  // Fallback: Check wrapped tokens from MERGE_CONFIG (older structure)
  if (config.MERGE_CONFIG) {
    const { currencyPositions, companyPositions } = config.MERGE_CONFIG;

    // Check currency positions
    if (currencyPositions?.yes?.wrap?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in MERGE_CONFIG.currencyPositions.yes: ${normalizedAddress} -> ${currencyPositions.yes.wrap.tokenSymbol}`);
      return currencyPositions.yes.wrap.tokenSymbol;
    }
    if (currencyPositions?.no?.wrap?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in MERGE_CONFIG.currencyPositions.no: ${normalizedAddress} -> ${currencyPositions.no.wrap.tokenSymbol}`);
      return currencyPositions.no.wrap.tokenSymbol;
    }

    // Check company positions
    if (companyPositions?.yes?.wrap?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in MERGE_CONFIG.companyPositions.yes: ${normalizedAddress} -> ${companyPositions.yes.wrap.tokenSymbol}`);
      return companyPositions.yes.wrap.tokenSymbol;
    }
    if (companyPositions?.no?.wrap?.wrappedCollateralTokenAddress?.toLowerCase() === normalizedAddress) {
      console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ✅ FOUND in MERGE_CONFIG.companyPositions.no: ${normalizedAddress} -> ${companyPositions.no.wrap.tokenSymbol}`);
      return companyPositions.no.wrap.tokenSymbol;
    }
  }

  console.log(`[TRADE_HISTORY_DEBUG] 🔧 CONFIG: ❌ NOT FOUND in contract config: ${normalizedAddress}`);
  return null;
}

// Batch fetch all unique token symbols with contract config priority
async function batchFetchTokenSymbols(rawTrades, config = null) {
  const uniqueTokens = new Set();

  // Collect all unique token addresses
  rawTrades.forEach(trade => {
    if (trade.token0) uniqueTokens.add(trade.token0.toLowerCase());
    if (trade.token1) uniqueTokens.add(trade.token1.toLowerCase());
  });

  const uniqueTokenArray = Array.from(uniqueTokens);
  console.log(`[TRADE_HISTORY_DEBUG] 🏷️ BATCH: Batch fetching symbols for ${uniqueTokenArray.length} unique tokens (avoiding ${rawTrades.length * 2 - uniqueTokenArray.length} redundant RPC calls)`);

  const batchStartTime = performance.now();

  // Count cache hits vs config hits vs RPC calls before making requests
  let cacheHits = 0;
  let configHits = 0;
  let rpcCallsNeeded = 0;

  uniqueTokenArray.forEach(tokenAddress => {
    if (tokenSymbolCache.has(tokenAddress)) {
      cacheHits++;
    } else if (config && getTokenSymbolFromConfig(tokenAddress, config)) {
      configHits++;
    } else {
      rpcCallsNeeded++;
    }
  });

  console.log(`[TRADE_HISTORY_DEBUG] 🏷️ BATCH: Pre-fetch analysis - Cache hits: ${cacheHits}, Config hits: ${configHits}, RPC calls needed: ${rpcCallsNeeded}`);

  // Fetch symbols for all unique tokens in parallel
  const symbolPromises = uniqueTokenArray.map(async (tokenAddress) => {
    try {
      const symbol = await getTokenSymbol(tokenAddress, config);
      return { address: tokenAddress, symbol };
    } catch (error) {
      console.error(`[TRADE_HISTORY_DEBUG] ❌ BATCH: Failed to fetch symbol for ${tokenAddress}:`, error);
      return { address: tokenAddress, symbol: null };
    }
  });

  const symbolResults = await Promise.all(symbolPromises);
  const batchEndTime = performance.now();

  // Count actual results for guarantee verification
  let actualConfigHits = 0;
  let actualCacheHits = 0;
  let actualRpcCalls = 0;

  symbolResults.forEach(({ address, symbol }) => {
    if (symbol) {
      if (tokenSymbolCache.has(address)) {
        actualCacheHits++;
      } else {
        actualRpcCalls++;
      }
    }
  });

  console.log(`[TRADE_HISTORY_DEBUG] 🏷️ BATCH: Completed batch symbol fetch. Time: ${(batchEndTime - batchStartTime).toFixed(2)}ms`);
  console.log(`[TRADE_HISTORY_DEBUG] 🏷️ BATCH: Efficiency: ${cacheHits + configHits}/${uniqueTokenArray.length} non-RPC, ${rpcCallsNeeded} RPC calls`);
  console.log(`[TRADE_HISTORY_DEBUG] 🏷️ BATCH: ✅ GUARANTEED RESULTS - Contract config avoided ${cacheHits + configHits} RPC calls out of ${uniqueTokenArray.length} total tokens`);

  return symbolResults.reduce((acc, { address, symbol }) => {
    acc[address] = symbol;
    return acc;
  }, {});
}

// Enrich raw trade data with token symbols and determine trade type (Conditional or Prediction)
async function enrichTradeData(rawTrades, poolAddressForLog, config = null) {
  if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') console.log(`DEBUG: enrichTradeData called for pool: ${poolAddressForLog}, with ${rawTrades.length} trades.`);

  // Batch fetch all token symbols first to minimize RPC calls
  const symbolMap = await batchFetchTokenSymbols(rawTrades, config);

  const enrichedTrades = [];
  for (const trade of rawTrades) {
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') console.log(`DEBUG: Enriching trade: ${trade.evt_tx_hash}, token0: ${trade.token0}, token1: ${trade.token1}`);

    // Use pre-fetched symbols from batch operation (much faster!)
    const token0SymbolStr = symbolMap[trade.token0?.toLowerCase()] || null;
    const token1SymbolStr = symbolMap[trade.token1?.toLowerCase()] || null;

    // Note: tokenSymbolCache is already updated by getTokenSymbol in batch fetch
    const parsedToken0 = parseTokenSymbol(token0SymbolStr);
    const parsedToken1 = parseTokenSymbol(token1SymbolStr);

    let poolType = 'UNKNOWN_POOL';
    if (parsedToken0.prefix === 'YES' || parsedToken1.prefix === 'YES') {
      poolType = 'YES_POOL';
    } else if (parsedToken0.prefix === 'NO' || parsedToken1.prefix === 'NO') {
      poolType = 'NO_POOL';
    }

    let marketCategory = 'Conditional';
    // Use base currency symbol from config if available
    const baseCurrencySymbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || DEFAULT_CURRENCY_SYMBOL;

    // Logic from getTradeHistory.js to determine marketCategory
    const token0IsSDAI = token0SymbolStr === baseCurrencySymbol;
    const token1IsSDAI = token1SymbolStr === baseCurrencySymbol;
    const token0HasPrefix = parsedToken0.prefix === 'YES' || parsedToken0.prefix === 'NO';
    const token1HasPrefix = parsedToken1.prefix === 'YES' || parsedToken1.prefix === 'NO';

    if ((token0HasPrefix && token1IsSDAI) || (token1HasPrefix && token0IsSDAI)) {
      marketCategory = 'Prediction';
    }

    enrichedTrades.push({
      ...trade,
      token0_symbol: token0SymbolStr,
      token1_symbol: token1SymbolStr,
      poolType,
      marketCategory,
    });
  }
  if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') console.log('DEBUG: enrichTradeData finished. Enriched trades:', enrichedTrades.length);
  return enrichedTrades;
}

// This function processes an individual enriched trade to match the final script output structure
async function processAndFormatTrade(enrichedTrade, queriedPoolAddress) {
  // DEBUG_MODE is used directly as it's a module-level constant
  if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
    console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): START processAndFormatTrade for tx: ${enrichedTrade.evt_tx_hash}`, JSON.stringify(enrichedTrade, null, 2));
  }

  let finalOutcome = 'N/A';
  let finalSide = 'N/A';
  let price = 0;

  const amount0_BN = safeBigNumberFrom(enrichedTrade.amount0 || '0');
  const amount1_BN = safeBigNumberFrom(enrichedTrade.amount1 || '0');

  // Absolute values for easier logic
  const amount0_abs_BN = amount0_BN.abs();
  const amount1_abs_BN = amount1_BN.abs();

  if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
    console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): Raw amounts BN - amount0: ${amount0_BN.toString()}, amount1: ${amount1_BN.toString()}`);
    console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): Absolute amounts BN - amount0_abs: ${amount0_abs_BN.toString()}, amount1_abs: ${amount1_abs_BN.toString()}`);
  }

  // primary_amount_wei is the absolute amount of token0 (e.g. NO_sDAI).
  // primary_cost_wei is the absolute amount of token1 (e.g. NO_GNO or collateral).
  const primary_amount_wei = amount0_abs_BN;
  const primary_cost_wei = amount1_abs_BN;

  if (enrichedTrade.marketCategory === 'Conditional' || enrichedTrade.marketCategory === 'Prediction') {
    // Assuming amount0_BN is for the primary token (e.g., NO_sDAI in your example)
    // and amount1_BN is for the counter token (e.g., NO_GNO or collateral like sDAI)
    if (amount0_BN.lt(ethers.BigNumber.from(0))) { // User sent/sold token0 (e.g. NO_sDAI)
      finalSide = 'sell';
    } else { // User received/bought token0 (paid with token1)
      finalSide = 'buy';
    }
    // Determine outcome based on token0's prefix (assuming token0 is the defining conditional/prediction token)
    if (enrichedTrade.token0_symbol && enrichedTrade.token0_symbol.startsWith('YES')) finalOutcome = 'YES';
    else if (enrichedTrade.token0_symbol && enrichedTrade.token0_symbol.startsWith('NO')) finalOutcome = 'NO';
  }

  // Price calculation: (cost_in_collateral / amount_of_primary_token)
  // Price of token0 in terms of token1
  if (!primary_amount_wei.isZero()) {
    // primary_cost_wei (token1) uses decimals1, primary_amount_wei (token0) uses decimals0
    const cost_formatted_for_price = parseFloat(ethers.utils.formatUnits(primary_cost_wei, 18));
    const amount_formatted_for_price = parseFloat(ethers.utils.formatUnits(primary_amount_wei, 18));
    if (amount_formatted_for_price !== 0) {
      price = (cost_formatted_for_price / amount_formatted_for_price).toFixed(2);
    }
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
      console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): Price Calc - cost_formatted: ${cost_formatted_for_price}, amount_formatted: ${amount_formatted_for_price}, price: ${price}`);
    }
  }

  if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
    console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): Intermediate main values - finalSide: ${finalSide}, finalOutcome: ${finalOutcome}, price: ${price}`);
    console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): Intermediate main amounts (Wei) - primary_amount_wei (token0): ${primary_amount_wei.toString()}, primary_cost_wei (token1): ${primary_cost_wei.toString()}`);
  }

  // Logic for the 'amounts' object (user's perspective: what was sent IN, what was received OUT)
  let userSent_TokenSymbol_forAmounts;
  let userSent_AmountWei_forAmounts;
  let userReceived_TokenSymbol_forAmounts;
  let userReceived_AmountWei_forAmounts;

  // amountX_BN is the net change to the USER'S balance of tokenX.
  // If amountX_BN is negative, user's balance of tokenX decreased (user SENT tokenX).
  // If amountX_BN is positive, user's balance of tokenX increased (user RECEIVED tokenX).
  if (amount0_BN.lt(ethers.BigNumber.from(0))) {
    userSent_TokenSymbol_forAmounts = enrichedTrade.token0_symbol;
    userSent_AmountWei_forAmounts = amount0_abs_BN; // The absolute amount sent
  } else if (amount0_BN.gt(ethers.BigNumber.from(0))) {
    userReceived_TokenSymbol_forAmounts = enrichedTrade.token0_symbol;
    userReceived_AmountWei_forAmounts = amount0_abs_BN; // The absolute amount received
  }

  if (amount1_BN.lt(ethers.BigNumber.from(0))) {
    // If userSent_TokenSymbol_forAmounts is already set (from token0), this means user sent both (LP Add?)
    // For typical swaps, only one of userSent or userReceived will be set by token0 logic, 
    // and the other by token1 logic.
    userSent_TokenSymbol_forAmounts = enrichedTrade.token1_symbol;
    userSent_AmountWei_forAmounts = amount1_abs_BN;
  } else if (amount1_BN.gt(ethers.BigNumber.from(0))) {
    userReceived_TokenSymbol_forAmounts = enrichedTrade.token1_symbol;
    userReceived_AmountWei_forAmounts = amount1_abs_BN;
  }

  if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
    console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): For Amounts Object - User Sent: ${userSent_AmountWei_forAmounts?.toString()} of ${userSent_TokenSymbol_forAmounts}`);
    console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): For Amounts Object - User Received: ${userReceived_AmountWei_forAmounts?.toString()} of ${userReceived_TokenSymbol_forAmounts}`);
  }

  // Determine decimals for formatting sent/received amounts
  const decimalsForSentToken = userSent_TokenSymbol_forAmounts === enrichedTrade.token0_symbol ? 18 : (userSent_TokenSymbol_forAmounts === enrichedTrade.token1_symbol ? 18 : 18);
  const decimalsForReceivedToken = userReceived_TokenSymbol_forAmounts === enrichedTrade.token0_symbol ? 18 : (userReceived_TokenSymbol_forAmounts === enrichedTrade.token1_symbol ? 18 : 18);

  let formattedUserSentAmount = "0.000000";
  if (userSent_TokenSymbol_forAmounts && userSent_AmountWei_forAmounts) {
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
      console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): Before formatUnits for UserSent (amounts.in) - value: ${userSent_AmountWei_forAmounts.toString()}, symbol: ${userSent_TokenSymbol_forAmounts}, decimals: ${decimalsForSentToken}`);
    }
    formattedUserSentAmount = parseFloat(ethers.utils.formatUnits(userSent_AmountWei_forAmounts, decimalsForSentToken)).toFixed(6);
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
      console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): After formatUnits for UserSent (amounts.in) - formattedUserSentAmount: ${formattedUserSentAmount}`);
    }
  }

  let formattedUserReceivedAmount = "0.000000";
  if (userReceived_TokenSymbol_forAmounts && userReceived_AmountWei_forAmounts) {
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
      console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): Before formatUnits for UserReceived (amounts.out) - value: ${userReceived_AmountWei_forAmounts.toString()}, symbol: ${userReceived_TokenSymbol_forAmounts}, decimals: ${decimalsForReceivedToken}`);
    }
    formattedUserReceivedAmount = parseFloat(ethers.utils.formatUnits(userReceived_AmountWei_forAmounts, decimalsForReceivedToken)).toFixed(6);
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
      console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): After formatUnits for UserReceived (amounts.out) - formattedUserReceivedAmount: ${formattedUserReceivedAmount}`);
    }
  }

  const formattedTrade = {
    eventId: enrichedTrade.id || null, // Use enrichedTrade.id
    outcome: finalOutcome,
    side: finalSide,
    type: finalSide, // Assuming type is same as side for now
    price: price, // Already toFixed(2)
    // Amount of the "primary" token (token0) traded, formatted with decimals0
    amount: parseFloat(ethers.utils.formatUnits(primary_amount_wei, 18)).toFixed(6),
    // Cost in terms of the "counter" token (token1), formatted with decimals1
    cost: parseFloat(ethers.utils.formatUnits(primary_cost_wei, 18)).toFixed(6),
    timestamp: formatTimestampForViewModel(enrichedTrade.evt_block_time),
    txHash: enrichedTrade.evt_tx_hash,
    poolType: enrichedTrade.poolType || 'N/A',
    marketCategory: enrichedTrade.marketCategory || 'N/A',
    token0Symbol: enrichedTrade.token0_symbol || 'N/A',
    token1Symbol: enrichedTrade.token1_symbol || 'N/A',
    queriedPoolAddress: queriedPoolAddress, // Keep track of which pool this trade came from
    amounts: {
      in: { value: formattedUserSentAmount, token: userSent_TokenSymbol_forAmounts || 'N/A' },
      out: { value: formattedUserReceivedAmount, token: userReceived_TokenSymbol_forAmounts || 'N/A' },
    },
    formattedTimestamp: formatTimestamp(enrichedTrade.evt_block_time), // Using existing helper
  };

  if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
    console.log(`DEBUG (MarketHistoryViewModel - processAndFormatTrade): END processAndFormatTrade. Final formatted trade for tx ${enrichedTrade.evt_tx_hash}:`, JSON.stringify(formattedTrade, null, 2));
  }

  return formattedTrade;
}

export function useTradeHistory(config = null) { // eslint-disable-line no-unused-vars
  // The Supabase trade-history backend (direct table reads, the Trade-History
  // edge function, the realtime subscription, and the polling loop) is
  // permanently gone. Trade history in the production UI is served by the
  // subgraph (SubgraphTradesDataLayer); this hook now returns an empty,
  // disabled state so legacy consumers keep working.
  const [trades] = React.useState([]);
  const fetchTrades = React.useCallback(async () => [], []);
  return { trades, loading: false, error: null, fetchTrades };
}

// Helper function to open transaction in explorer with chain detection
export function openTransactionInExplorer(txHash, config = null) {
  // Clean up transaction hash - remove any suffix after underscore
  // Example: "0xdc75d59a694c825afd208179889aa21b78e79e1265709c70611bb92b5a437baf_142" 
  // becomes: "0xdc75d59a694c825afd208179889aa21b78e79e1265709c70611bb92b5a437baf"
  const cleanTxHash = txHash.split('_')[0];

  // Determine explorer URL based on chain
  let explorerUrl = 'https://gnosisscan.io/tx/'; // Default to Gnosis Chain

  if (config?.metadata?.chainId) {
    switch (config.metadata.chainId) {
      case 1:
        explorerUrl = 'https://etherscan.io/tx/';
        break;
      case 100:
        explorerUrl = 'https://gnosisscan.io/tx/';
        break;
      case 137:
        explorerUrl = 'https://polygonscan.com/tx/';
        break;
      case 42161:
        explorerUrl = 'https://arbiscan.io/tx/';
        break;
      default:
        explorerUrl = 'https://gnosisscan.io/tx/'; // Default fallback
    }
  }

  const fullUrl = `${explorerUrl}${cleanTxHash}`;
  console.log(`[TRADE_HISTORY_DEBUG] Opening transaction in explorer: ${txHash} -> ${cleanTxHash} (Chain: ${config?.metadata?.chainId || 'default'}) -> ${fullUrl}`);
  window.open(fullUrl, '_blank');
}

const formatTimestamp = (timestamp) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');
};

// Mock data for debug mode
const API_MOCK_DATA = [
  {
    eventId: 123,
    outcome: "Yes",
    side: "buy",
    price: 0.50,
    amount: 1000,
    cost: 500,
    timestamp: "2024-09-02T10:00:00Z",
    txHash: "0xabcdef123456..."
  },
  {
    eventId: 123,
    outcome: "No",
    side: "sell",
    price: 0.40,
    amount: 800,
    cost: 320,
    timestamp: "2024-09-05T14:30:00Z",
    txHash: "0x123456abcdef..."
  },
  {
    eventId: 124,
    outcome: "Yes",
    side: "buy",
    price: 0.60,
    amount: 500,
    cost: 300,
    timestamp: "2024-09-10T09:45:00Z",
    txHash: "0x98765abc123..."
  },
  {
    eventId: 125,
    outcome: "Yes",
    side: "sell",
    price: 0.40,
    amount: 320,
    cost: 100,
    timestamp: "2024-09-10T09:45:00Z",
    txHash: "0x98765abc123..."
  },
  {
    eventId: 125,
    outcome: "Yes",
    side: "sell",
    price: 0.40,
    amount: 320,
    cost: 100,
    timestamp: "2024-09-10T09:45:00Z",
    txHash: "0x98765abc123..."
  },
  {
    eventId: 125,
    outcome: "Yes",
    side: "sell",
    price: 0.40,
    amount: 320,
    cost: 100,
    timestamp: "2024-09-10T09:45:00Z",
    txHash: "0x98765abc123..."
  }
];

const formatPrice = (price) => {
  return `$ ${price.toFixed(2)}`;
};

const formatAmount = (amount) => {
  return amount.toLocaleString();
};

// Format trade data with token images passed directly
const formatTradeData = (trade, tokenImages = { company: null, currency: null }) => {
  try {
    console.log('Raw API trade:', trade);

    // Determine which amount is in/out based on side
    const amountIn = trade.side === 'sell' ? trade.amount0 : trade.amount1;
    const amountOut = trade.side === 'sell' ? trade.amount1 : trade.amount0;

    return {
      outcome: `${trade.outcome} - ${trade.side.charAt(0).toUpperCase() + trade.side.slice(1)}`,
      amounts: {
        in: {
          value: amountIn || '0.000000',
          token: trade.outcome === 'Yes' ? 'GNO' : 'SDAI',
          image: trade.outcome === 'Yes' ? tokenImages.company : tokenImages.currency
        },
        out: {
          value: amountOut || '0.000000',
          token: trade.outcome === 'Yes' ? 'SDAI' : 'GNO',
          image: trade.outcome === 'Yes' ? tokenImages.currency : tokenImages.company
        }
      },
      price: trade.price,
      timestamp: trade.timestamp,
      formattedTimestamp: formatTimestamp(trade.timestamp),
      txHash: trade.txHash
    };
  } catch (error) {
    console.error('Error formatting trade:', error, trade);
    throw error;
  }
};