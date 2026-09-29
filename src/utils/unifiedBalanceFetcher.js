/**
 * Unified Balance and Position Fetcher
 *
 * Uses the getBestRpc system for optimal performance:
 * - Parallel RPC testing to find fastest endpoint
 * - 5-minute caching of best RPC
 * - 5-second timeouts on slow RPCs
 * - Batch balance fetching for efficiency
 *
 * Fetches all balance and position data in one optimized call:
 * - Base tokens (ERC20): currency, company, native
 * - Position tokens (ERC1155): YES/NO for both currency and company
 * - Wrapped position tokens (ERC20): wrapped versions of positions
 */

import { ethers } from 'ethers';
import { getBestRpcProvider } from './getBestRpc';
import { readOrNull } from './balanceReadState';

/**
 * TESTING FLAGS - Enable to simulate various failure scenarios
 *
 * SIMULATE_RPC_FAILURE: When true, simulates complete RPC failure
 * - Fails at the provider level (getBestRpc will fail)
 * - All balance fetches fail (reported as null + an error, never as 0)
 * - Useful for testing error handling and fallback UI states
 *
 * SHOW_REALISTIC_ERROR: When true, shows realistic error messages instead of "Simulated" prefix
 * - Shows what users would actually see in production
 * - Use this to test different real-world error scenarios
 *
 * To test failure scenarios:
 * 1. Set SIMULATE_RPC_FAILURE = true
 * 2. Set SHOW_REALISTIC_ERROR = true (to see real error messages)
 * 3. Change REALISTIC_ERROR_TYPE to test different scenarios
 * 4. Reload the app and check error messages in UI
 * 5. Set back to false when done testing
 */
const SIMULATE_RPC_FAILURE = false;
const SHOW_REALISTIC_ERROR = true; // Show realistic error messages (not "Simulated")

/**
 * REALISTIC_ERROR_TYPE: Choose which real-world error to simulate
 *
 * Options:
 * - 'timeout': Network timeout (5+ seconds with no response)
 * - 'network': Network connection error
 * - 'all_failed': All RPC endpoints failed
 * - 'invalid_response': Invalid JSON-RPC response
 * - 'rate_limit': Rate limit exceeded (429 error)
 * - 'chain_mismatch': Wrong chain ID
 */
const REALISTIC_ERROR_TYPE = 'all_failed'; // Change this to test different scenarios

// Map of realistic error messages that would appear in production
const REALISTIC_ERRORS = {
  timeout: 'timeout',
  network: 'network error',
  all_failed: 'All RPC endpoints failed for chain 100',
  invalid_response: 'invalid JSON-RPC response',
  rate_limit: 'Too Many Requests (rate limit exceeded)',
  chain_mismatch: 'chainId mismatch: expected 100, got 1',
};

// Log the simulation status
if (SIMULATE_RPC_FAILURE) {
  console.warn('⚠️⚠️⚠️ [UNIFIED-BALANCE] RPC FAILURE SIMULATION ENABLED ⚠️⚠️⚠️');
  if (SHOW_REALISTIC_ERROR) {
    console.warn(`[UNIFIED-BALANCE] Simulating realistic error: "${REALISTIC_ERRORS[REALISTIC_ERROR_TYPE]}"`);
    console.warn('[UNIFIED-BALANCE] This is what users would see in production');
  } else {
    console.warn('[UNIFIED-BALANCE] All RPC calls will fail with "Simulated" error messages');
  }
  console.warn('[UNIFIED-BALANCE] Set SIMULATE_RPC_FAILURE = false to disable');
}

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])"
];

/**
 * Helper to format balance safely.
 * A failed read (null) stays null so the UI can tell it from a real zero.
 */
function formatBalanceSafely(balance) {
  try {
    if (balance === null || balance === undefined) return null;
    const formatted = ethers.utils.formatEther(balance);
    return formatted === 'NaN' ? null : formatted;
  } catch (error) {
    console.error('[UNIFIED-BALANCE] Error formatting balance:', error);
    return null;
  }
}

/**
 * Helper to calculate total (unwrapped + wrapped).
 * Unknown if either part failed to load.
 */
function calculateTotal(unwrapped, wrapped) {
  if (unwrapped === null || wrapped === null) return null;
  try {
    const unwrappedBN = ethers.utils.parseUnits(unwrapped || '0', 18);
    const wrappedBN = ethers.utils.parseUnits(wrapped || '0', 18);
    const totalBN = unwrappedBN.add(wrappedBN);
    return ethers.utils.formatUnits(totalBN, 18);
  } catch (error) {
    console.error('[UNIFIED-BALANCE] Error calculating total:', error);
    return '0';
  }
}

/**
 * Safe contract call wrapper with error handling.
 * Resolves to null (never 0) on failure and records the read in `failed`.
 */
async function safeContractCall(contractCall, description, failed) {
  return readOrNull(async () => {
    // Simulate RPC failure for testing if flag is enabled
    if (SIMULATE_RPC_FAILURE) {
      console.warn(`[UNIFIED-BALANCE] 🧪 SIMULATING FAILURE for ${description}`);
      const errorMessage = SHOW_REALISTIC_ERROR
        ? REALISTIC_ERRORS[REALISTIC_ERROR_TYPE]
        : 'Simulated RPC failure - testing error handling';
      throw new Error(errorMessage);
    }

    const result = await contractCall();
    console.log(`[UNIFIED-BALANCE] ✅ ${description}: ${result?.toString()}`);
    return result;
  }, description, failed);
}

/**
 * Fetch all balances and positions for a user
 *
 * @param {Object} config - Contract configuration with BASE_TOKENS_CONFIG, MERGE_CONFIG, CONDITIONAL_TOKENS_ADDRESS
 * @param {string} address - User wallet address
 * @param {number} chainId - Chain ID (1 for Ethereum, 100 for Gnosis)
 * @returns {Promise<Object>} Object containing all balances and positions.
 *   A balance whose read failed is null (not '0'), and `failedReads` lists
 *   the reads that failed, out of `totalReads`.
 */
export async function fetchAllBalancesAndPositions(config, address, chainId = 100) {
  console.log('[UNIFIED-BALANCE] 🚀 Starting unified balance fetch...', {
    address,
    chainId,
    hasConfig: !!config
  });

  if (!config || !address) {
    throw new Error('Config and address are required');
  }

  const { BASE_TOKENS_CONFIG, MERGE_CONFIG, CONDITIONAL_TOKENS_ADDRESS } = config;

  if (!BASE_TOKENS_CONFIG || !MERGE_CONFIG || !CONDITIONAL_TOKENS_ADDRESS) {
    throw new Error('Invalid config: missing required fields');
  }

  // Get the best RPC provider for the chain
  console.log('[UNIFIED-BALANCE] 🔍 Getting best RPC provider...');

  // Simulate RPC provider failure if flag is enabled
  if (SIMULATE_RPC_FAILURE) {
    console.error('[UNIFIED-BALANCE] 🧪 SIMULATING RPC PROVIDER FAILURE - All RPCs will fail!');
    const errorMessage = SHOW_REALISTIC_ERROR
      ? REALISTIC_ERRORS[REALISTIC_ERROR_TYPE]
      : 'Simulated RPC provider failure - testing error handling at provider level';
    throw new Error(errorMessage);
  }

  const provider = await getBestRpcProvider(chainId);
  console.log('[UNIFIED-BALANCE] ✅ Provider ready');

  // Create contract instances
  const currencyContract = new ethers.Contract(
    BASE_TOKENS_CONFIG.currency.address,
    ERC20_ABI,
    provider
  );

  const companyContract = new ethers.Contract(
    BASE_TOKENS_CONFIG.company.address,
    ERC20_ABI,
    provider
  );

  // Wrapped position token contracts
  const wrappedCurrencyYesContract = new ethers.Contract(
    MERGE_CONFIG.currencyPositions.yes.wrap.wrappedCollateralTokenAddress,
    ERC20_ABI,
    provider
  );

  const wrappedCurrencyNoContract = new ethers.Contract(
    MERGE_CONFIG.currencyPositions.no.wrap.wrappedCollateralTokenAddress,
    ERC20_ABI,
    provider
  );

  const wrappedCompanyYesContract = new ethers.Contract(
    MERGE_CONFIG.companyPositions.yes.wrap.wrappedCollateralTokenAddress,
    ERC20_ABI,
    provider
  );

  const wrappedCompanyNoContract = new ethers.Contract(
    MERGE_CONFIG.companyPositions.no.wrap.wrappedCollateralTokenAddress,
    ERC20_ABI,
    provider
  );

  // Conditional tokens contract for ERC1155 positions
  const conditionalTokensContract = new ethers.Contract(
    CONDITIONAL_TOKENS_ADDRESS,
    ERC1155_ABI,
    provider
  );

  // Position IDs for batch query
  const positionIds = [
    MERGE_CONFIG.currencyPositions.yes.positionId,
    MERGE_CONFIG.currencyPositions.no.positionId,
    MERGE_CONFIG.companyPositions.yes.positionId,
    MERGE_CONFIG.companyPositions.no.positionId
  ];

  console.log('[UNIFIED-BALANCE] 📋 Position IDs:', positionIds);

  // Fetch all balances in parallel
  console.log('[UNIFIED-BALANCE] 🔄 Fetching all balances in parallel...');
  const failedReads = [];

  const [
    // Base tokens
    currencyBalance,
    companyBalance,
    nativeBalance,

    // Wrapped position tokens
    wrappedCurrencyYesBalance,
    wrappedCurrencyNoBalance,
    wrappedCompanyYesBalance,
    wrappedCompanyNoBalance,

    // ERC1155 position tokens (batch)
    positionBalances
  ] = await Promise.all([
    // Base tokens
    safeContractCall(() => currencyContract.balanceOf(address), `Currency balance`, failedReads),
    safeContractCall(() => companyContract.balanceOf(address), `Company balance`, failedReads),
    safeContractCall(() => provider.getBalance(address), `Native balance`, failedReads),

    // Wrapped position tokens
    safeContractCall(() => wrappedCurrencyYesContract.balanceOf(address), `Wrapped currency YES`, failedReads),
    safeContractCall(() => wrappedCurrencyNoContract.balanceOf(address), `Wrapped currency NO`, failedReads),
    safeContractCall(() => wrappedCompanyYesContract.balanceOf(address), `Wrapped company YES`, failedReads),
    safeContractCall(() => wrappedCompanyNoContract.balanceOf(address), `Wrapped company NO`, failedReads),

    // ERC1155 positions (batch query)
    safeContractCall(
      () => conditionalTokensContract.balanceOfBatch(
        Array(positionIds.length).fill(address),
        positionIds
      ),
      `ERC1155 position balances`,
      failedReads
    ).then(result => Array.isArray(result) ? result : [null, null, null, null])
  ]);

  console.log('[UNIFIED-BALANCE] 📊 Raw results:', {
    currency: currencyBalance?.toString(),
    company: companyBalance?.toString(),
    native: nativeBalance?.toString(),
    positions: positionBalances.map(b => b?.toString()),
    failedReads
  });

  // Format all balances
  const formattedBalances = {
    // Base tokens
    currency: formatBalanceSafely(currencyBalance),
    company: formatBalanceSafely(companyBalance),
    native: formatBalanceSafely(nativeBalance),

    // Position tokens (ERC1155)
    currencyYes: formatBalanceSafely(positionBalances[0]),
    currencyNo: formatBalanceSafely(positionBalances[1]),
    companyYes: formatBalanceSafely(positionBalances[2]),
    companyNo: formatBalanceSafely(positionBalances[3]),

    // Wrapped position tokens (ERC20)
    wrappedCurrencyYes: formatBalanceSafely(wrappedCurrencyYesBalance),
    wrappedCurrencyNo: formatBalanceSafely(wrappedCurrencyNoBalance),
    wrappedCompanyYes: formatBalanceSafely(wrappedCompanyYesBalance),
    wrappedCompanyNo: formatBalanceSafely(wrappedCompanyNoBalance)
  };

  // Calculate totals
  formattedBalances.totalCurrencyYes = calculateTotal(
    formattedBalances.currencyYes,
    formattedBalances.wrappedCurrencyYes
  );
  formattedBalances.totalCurrencyNo = calculateTotal(
    formattedBalances.currencyNo,
    formattedBalances.wrappedCurrencyNo
  );
  formattedBalances.totalCompanyYes = calculateTotal(
    formattedBalances.companyYes,
    formattedBalances.wrappedCompanyYes
  );
  formattedBalances.totalCompanyNo = calculateTotal(
    formattedBalances.companyNo,
    formattedBalances.wrappedCompanyNo
  );

  console.log('[UNIFIED-BALANCE] ✅ Balance fetch finished:', formattedBalances);

  return { ...formattedBalances, failedReads, totalReads: 8 };
}

/**
 * Fetch allowances for base tokens
 *
 * @param {Object} config - Contract configuration
 * @param {string} ownerAddress - Owner wallet address
 * @param {string} spenderAddress - Spender contract address
 * @param {number} chainId - Chain ID
 * @returns {Promise<Object>} Object containing allowances
 */
export async function fetchAllowances(config, ownerAddress, spenderAddress, chainId = 100) {
  console.log('[UNIFIED-BALANCE] 🔍 Fetching allowances...', {
    owner: ownerAddress,
    spender: spenderAddress,
    chainId
  });

  if (!config || !ownerAddress || !spenderAddress) {
    throw new Error('Config, owner, and spender addresses are required');
  }

  const { BASE_TOKENS_CONFIG } = config;

  // Simulate RPC provider failure if flag is enabled
  if (SIMULATE_RPC_FAILURE) {
    console.error('[UNIFIED-BALANCE] 🧪 SIMULATING RPC PROVIDER FAILURE for allowances');
    const errorMessage = SHOW_REALISTIC_ERROR
      ? REALISTIC_ERRORS[REALISTIC_ERROR_TYPE]
      : 'Simulated RPC provider failure - testing error handling for allowances';
    throw new Error(errorMessage);
  }

  // Get the best RPC provider
  const provider = await getBestRpcProvider(chainId);

  // Create contract instances
  const currencyContract = new ethers.Contract(
    BASE_TOKENS_CONFIG.currency.address,
    ERC20_ABI,
    provider
  );

  const companyContract = new ethers.Contract(
    BASE_TOKENS_CONFIG.company.address,
    ERC20_ABI,
    provider
  );

  // Fetch allowances in parallel
  const failedReads = [];
  const [currencyAllowance, companyAllowance] = await Promise.all([
    safeContractCall(() => currencyContract.allowance(ownerAddress, spenderAddress), 'Currency allowance', failedReads),
    safeContractCall(() => companyContract.allowance(ownerAddress, spenderAddress), 'Company allowance', failedReads)
  ]);
  if (failedReads.length > 0) {
    throw new Error(`Failed to read allowances: ${failedReads.join(', ')}`);
  }

  const allowances = {
    currency: formatBalanceSafely(currencyAllowance),
    company: formatBalanceSafely(companyAllowance)
  };

  console.log('[UNIFIED-BALANCE] ✅ Allowances fetched:', allowances);

  return allowances;
}

/**
 * TESTING GUIDE
 *
 * To test RPC failure scenarios with REALISTIC error messages:
 *
 * 1. Configure simulation flags at the top of this file:
 *    - Set SIMULATE_RPC_FAILURE = true
 *    - Set SHOW_REALISTIC_ERROR = true (to see real production error messages)
 *    - Set REALISTIC_ERROR_TYPE to the scenario you want to test
 *
 * 2. Available error scenarios (change REALISTIC_ERROR_TYPE):
 *    - 'timeout': "timeout" (network timeout, slow response)
 *    - 'network': "network error" (connection failed)
 *    - 'all_failed': "All RPC endpoints failed for chain 100" (all RPCs down)
 *    - 'invalid_response': "invalid JSON-RPC response" (malformed data)
 *    - 'rate_limit': "Too Many Requests (rate limit exceeded)" (429 error)
 *    - 'chain_mismatch': "chainId mismatch: expected 100, got 1" (wrong network)
 *
 * 3. Run the app with npm run dev
 *
 * 4. Navigate to a market page and observe:
 *    - Balance widget shows error state with realistic message
 *    - Positions table shows error state with realistic message
 *    - "Try Again" buttons are functional
 *    - Console shows simulation warnings
 *    - UI remains responsive and usable
 *
 * 5. Test different scenarios:
 *    - Change REALISTIC_ERROR_TYPE to 'timeout'
 *    - Reload page, see "timeout" error in UI
 *    - Change to 'rate_limit'
 *    - Reload page, see "Too Many Requests" error in UI
 *    - etc.
 *
 * 6. Set SIMULATE_RPC_FAILURE = false to restore normal operation
 *
 * BENEFITS OF REALISTIC ERRORS:
 * - See exactly what users will see in production
 * - Test UI with different error message lengths
 * - Verify error messages are clear and actionable
 * - Ensure all error types are handled gracefully
 * - No "Simulated" prefix - pure production experience
 */
