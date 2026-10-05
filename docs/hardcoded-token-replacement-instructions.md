# Hardcoded Token Symbol Replacement Instructions

## Overview
This document identifies all locations in the codebase where hardcoded token symbols like "SDAI", "GNO", "xDAI", etc. need to be replaced with dynamic values from the contract configuration using `useContractConfig.js`.

## Contract Configuration Structure
The `useContractConfig` hook already provides the proper structure:
```javascript
const config = useContractConfig(proposalId);
// config.BASE_TOKENS_CONFIG.company.symbol (e.g., "PNK")
// config.BASE_TOKENS_CONFIG.currency.symbol (e.g., "sDAI")
```

The config returns:
```javascript
{
  BASE_TOKENS_CONFIG: {
    currency: {
      symbol: metadata.currencyTokens?.base?.tokenSymbol || 'sDAI',
      address: '0x...',
      name: '...',
      decimals: 18
    },
    company: {
      symbol: metadata.companyTokens?.base?.tokenSymbol || 'GNO',
      address: '0x...',
      name: '...',
      decimals: 18
    }
  }
}
```

---

## File: ShowcaseSwapComponent.jsx

### 1. Add useContractConfig Hook
**Current Issue**: Component doesn't use the contract config
**Action**: Add at the top of the component:
```javascript
const config = useContractConfig(proposalId); // proposalId needs to be passed as prop
```

### 2. Line 110-111: Hardcoded balance property names
**Current Issue**: Hardcoded balance property references
```javascript
sdaiBalance: '0',
wxdaiBalance: '0',
```
**Action**: These property names should be dynamic or the balance structure should be updated.

### 3. Line 173-178: SDAI mode balance calculation
**Current Issue**: Hardcoded 'SDAI' string and `sdaiBalance` property
```javascript
if (selectedCurrency === 'SDAI') {
  // SDAI mode: Sum position tokens + SDAI balance
  const baseBalance = balances?.sdaiBalance || '0';
```
**Action**: Replace with:
```javascript
if (selectedCurrency === config?.BASE_TOKENS_CONFIG?.currency?.symbol) {
  // Currency mode: Sum position tokens + currency balance
  const baseBalance = balances?.currencyBalance || '0'; // Update balance structure
```

### 4. Line 244: Hardcoded SDAI in transaction data
**Current Issue**: Hardcoded "SDAI" symbol
```javascript
amount: `${amount} SDAI`,
```
**Action**: Replace with:
```javascript
amount: `${amount} ${config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY'}`,
```

### 5. Line 267-268: Hardcoded fallback symbols
**Current Issue**: Hardcoded fallback symbols
```javascript
? `${amount} ${BASE_TOKENS_CONFIG?.company?.symbol || 'GNO_FALLBACK'}`
: `${amount} ${BASE_TOKENS_CONFIG?.currency?.symbol || 'SDAI_FALLBACK'}`,
```
**Action**: Replace BASE_TOKENS_CONFIG with config.BASE_TOKENS_CONFIG:
```javascript
? `${amount} ${config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY_TOKEN'}`
: `${amount} ${config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY_TOKEN'}`,
```

### 6. Line 571: Error message with hardcoded tokens
**Current Issue**: Hardcoded 'SDAI' and 'GNO' in error messages
```javascript
throw new Error(`Insufficient ${tokenType === 'currency' ? 'SDAI' : 'GNO'} balance.`);
```
**Action**: Replace with:
```javascript
throw new Error(`Insufficient ${tokenType === 'currency' ? config?.BASE_TOKENS_CONFIG?.currency?.symbol : config?.BASE_TOKENS_CONFIG?.company?.symbol} balance.`);
```

### 7. Line 928, 946: Balance display with hardcoded SDAI fallback
**Current Issue**: Hardcoded 'SDAI' fallback
```javascript
symbol = BASE_TOKENS_CONFIG?.currency?.symbol || 'SDAI';
```
**Action**: Replace BASE_TOKENS_CONFIG with config.BASE_TOKENS_CONFIG:
```javascript
symbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY';
```

### 8. Line 986: Company token fallback
**Current Issue**: Generic 'TOKEN' fallback
```javascript
symbol = BASE_TOKENS_CONFIG?.company?.symbol || 'TOKEN';
```
**Action**: Replace with:
```javascript
symbol = config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY';
```

### 9. Line 1053-1054, 1095-1096: formatBalance calls
**Current Issue**: BASE_TOKENS_CONFIG references
```javascript
formatBalance((inputAmount / price).toString(), BASE_TOKENS_CONFIG.company.symbol)
formatBalance((inputAmount * price).toString(), BASE_TOKENS_CONFIG.currency.symbol)
```
**Action**: Replace with config.BASE_TOKENS_CONFIG:
```javascript
formatBalance((inputAmount / price).toString(), config?.BASE_TOKENS_CONFIG?.company?.symbol)
formatBalance((inputAmount * price).toString(), config?.BASE_TOKENS_CONFIG?.currency?.symbol)
```

### 10. Line 1067-1068, 1109-1110: Recovery amount display
**Current Issue**: BASE_TOKENS_CONFIG references
```javascript
? BASE_TOKENS_CONFIG.currency.symbol
: BASE_TOKENS_CONFIG.company.symbol
```
**Action**: Replace with config.BASE_TOKENS_CONFIG:
```javascript
? config?.BASE_TOKENS_CONFIG?.currency?.symbol
: config?.BASE_TOKENS_CONFIG?.company?.symbol
```

---

## File: CollateralModal.jsx

### 1. Add useContractConfig Hook
**Current Issue**: Component doesn't use the contract config
**Action**: Add at the top of the component:
```javascript
const config = useContractConfig(proposalId); // proposalId needs to be passed as prop
```

### 2. Line 51, 60: TokenToggle hardcoded labels
**Current Issue**: Hardcoded "SDAI" and "GNO" labels
```javascript
SDAI
GNO
```
**Action**: Replace with:
```javascript
{config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY'}
{config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY'}
```

### 3. Line 665: Hardcoded balance property reference
**Current Issue**: Hardcoded `wxdai` and `faot` property names
```javascript
selectedTokenType === "currency" ? balances?.wxdai : balances?.faot;
```
**Action**: Replace with dynamic property names or update balance structure to use consistent naming.

### 4. Line 995-996: Hardcoded URLs
**Current Issue**: Hardcoded token symbols in URLs
```javascript
? tokenConfig.company.getTokenUrl || "https://swap.cow.fi/#/100/swap/sDAI/GNO"
: tokenConfig.currency.getTokenUrl || "https://swap.cow.fi/#/100/swap/xdai/sdai"
```
**Action**: Update URLs to use dynamic token symbols if needed, or keep as fallbacks.

### 5. Line 1016, 1029: Native token references
**Current Issue**: Hardcoded "xDAI" references
```javascript
{tokenConfig.nativeCoin?.symbol || "xDAI"} Balance
tokenConfig.nativeCoin?.symbol || "xDAI"
```
**Action**: These can stay as "xDAI" since it's the native chain token, but should ideally be configurable.

### 6. Line 1054, 1063: formatBalance calls
**Current Issue**: Hardcoded "SDAI" and "GNO" in formatBalance calls
```javascript
selectedTokenType === "currency" ? "SDAI" : "GNO"
```
**Action**: Replace with:
```javascript
selectedTokenType === "currency" 
  ? config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY'
  : config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY'
```

---

## File: MarketPageShowcase.jsx

### 1. Add useContractConfig Hook (if not already present)
**Current Issue**: Component may not be using the contract config consistently
**Action**: Ensure the component has:
```javascript
const config = useContractConfig(proposalId);
```

### 2. Line 1013: Hardcoded GNO in market title
**Current Issue**: Hardcoded "GNO" in market title template
```javascript
const rawMarketTitle = config?.marketInfo?.title || "What will be the impact on GNO price if GnosisPay reaches $5mil weekly volume?";
```
**Action**: Replace with dynamic token symbol:
```javascript
const rawMarketTitle = config?.marketInfo?.title || `What will be the impact on ${config?.BASE_TOKENS_CONFIG?.company?.symbol || 'TOKEN'} price if...`;
```

### 3. Line 1018-1019: Market title parsing
**Current Issue**: Hardcoded "GNO" references in title parsing
```javascript
const marketTitlePrefix = "What will be the impact on GNO price if";
```
**Action**: Make this dynamic based on config.

### 4. Line 1158-1160: Balance mapping with hardcoded comments
**Current Issue**: Comments mention specific tokens
```javascript
wxdai: rawBalances.currency, // SDAI balance for compatibility
faot: rawBalances.company,   // GNO balance for compatibility
```
**Action**: Update comments to be generic or use dynamic symbols.

### 5. Line 1185-1188: Default market data
**Current Issue**: Hardcoded GNO and sDAI references in default data
```javascript
display_title_0: "What will be the impact on GNO price",
description: "...using wrapped GNO and sDAI to speculate..."
```
**Action**: Make these dynamic or keep as fallback defaults.

### 6. Line 1350: Hardcoded WXDAI in approval
**Current Issue**: Hardcoded 'WXDAI' string in approval call
```javascript
'WXDAI'
```
**Action**: Replace with:
```javascript
config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY'
```

### 7. Line 2315: Error message with hardcoded WXDAI
**Current Issue**: Hardcoded WXDAI in error message
```javascript
throw new Error(`Insufficient WXDAI balance. You have ${ethers.utils.formatEther(balance)} WXDAI but need 0.01 WXDAI`);
```
**Action**: Replace with dynamic token symbol from config.

---

## Implementation Steps

### Step 1: Verify useContractConfig Hook
The `useContractConfig.js` hook already returns the proper structure with `BASE_TOKENS_CONFIG`. No changes needed to the hook itself.

### Step 2: Add Config to Components
Add `useContractConfig` hook to each component that needs it:

**ShowcaseSwapComponent.jsx:**
```javascript
const ShowcaseSwapComponent = ({ positions, prices, walletBalances, isLoadingBalances, account, isConnected, onConnectWallet, proposalId }) => {
  const config = useContractConfig(proposalId);
  // ... rest of component
```

**CollateralModal.jsx:**
```javascript
const CollateralModal = ({ title, supportText, handleClose, handleActionButtonClick, connectedWalletAddress, proposalId, ... }) => {
  const config = useContractConfig(proposalId);
  // ... rest of component
```

### Step 3: Create Helper Functions (Optional)
For cleaner code, create utility functions:
```javascript
const getCurrencySymbol = () => config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY';
const getCompanySymbol = () => config?.BASE_TOKENS_CONFIG?.company?.symbol || 'COMPANY';
```

### Step 4: Replace BASE_TOKENS_CONFIG References
Replace all imported `BASE_TOKENS_CONFIG` references with `config.BASE_TOKENS_CONFIG`:
```javascript
// OLD:
import { BASE_TOKENS_CONFIG } from './constants/contracts';
symbol = BASE_TOKENS_CONFIG?.currency?.symbol || 'SDAI';

// NEW:
symbol = config?.BASE_TOKENS_CONFIG?.currency?.symbol || 'CURRENCY';
```

### Step 5: Update Balance Structure (Optional)
Consider updating the balance structure to be more generic:
```javascript
// Instead of:
balances: { sdaiBalance, wxdaiBalance, faot }

// Use:
balances: { currencyBalance, companyBalance, nativeBalance }
```

## File: ConfirmSwapModal.jsx

### 1. Component Already Uses Config ✅
**Status**: Component already imports and uses `useContractConfig()` on line 424:
```javascript
const { config, loading: configLoading, error: configError } = useContractConfig();
```

### 2. Line 429-436: BASE_TOKENS_CONFIG fallback usage
**Current Issue**: Uses imported `DEFAULT_BASE_TOKENS_CONFIG` as fallback
```javascript
BASE_TOKENS_CONFIG = DEFAULT_BASE_TOKENS_CONFIG,
```
**Action**: The fallback is appropriate, but ensure all usage points use the config version.

### 3. Line 1755, 1761: Hardcoded 'SDAI' and 'GNO' in balance display
**Current Issue**: Hardcoded token symbols in existing balance display
```javascript
{existingBalance} {transactionData.action === 'Buy' ? 'SDAI' : 'GNO'}
{additionalCollateralNeeded} {transactionData.action === 'Buy' ? 'SDAI' : 'GNO'}
```
**Action**: Replace with:
```javascript
{existingBalance} {transactionData.action === 'Buy' 
  ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol 
  : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol}
{additionalCollateralNeeded} {transactionData.action === 'Buy' 
  ? (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol 
  : (BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol}
```

### 4. Line 1455-1495: Transaction Summary token symbol references
**Current Issue**: Multiple `BASE_TOKENS_CONFIG` references that should be consistent
**Status**: ✅ Already using dynamic `BASE_TOKENS_CONFIG` properly with fallbacks
**Note**: These are correctly implemented and don't need changes.

### 5. Line 1466-1495: formatBalance calls with dynamic symbols
**Current Issue**: Uses BASE_TOKENS_CONFIG properly but should ensure consistency
**Status**: ✅ Already properly implemented:
```javascript
(BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).currency.symbol
(BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG).company.symbol
```

### 6. Error Messages and Logging
**Current Issue**: Error messages may contain hardcoded token references
**Action**: Review any error messages that might contain hardcoded 'SDAI', 'GNO', etc.

**Summary for ConfirmSwapModal.jsx**: 
- ✅ Already uses `useContractConfig()` hook properly
- ✅ Most token symbol usage is already dynamic  
- ⚠️ Only lines 1755 and 1761 need updates for the collateral display section
- ✅ Transaction summary section already properly uses dynamic config

### 7. Line 809, 876, 882: Comments with hardcoded references
**Current Issue**: Comments mention specific tokens
```javascript
// Always recover/redeem from position token to native token (sDAI)
// Get SDAI token address for tokenOut (the redemption target)
console.log('Redemption tokenOut (SDAI):', tokenOut);
```
**Action**: Update comments to be generic or use dynamic references:
```javascript
// Always recover/redeem from position token to native currency token
// Get currency token address for tokenOut (the redemption target)
console.log('Redemption tokenOut (Currency):', tokenOut);
```

---

## File: constants/contracts.js

### Status: ✅ Hardcoded Values Are Appropriate
**Current Status**: This file contains hardcoded token symbols and addresses:
```javascript
export const BASE_TOKENS_CONFIG = {
    currency: {
        address: "0xaf204776c7245bF4147c2612BF6e5972Ee483701",
        symbol: "SDAI",
        name: "SDAI",
        decimals: 18
    },
    company: {
        address: "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb",
        symbol: "GNO",
        name: "Gnosis",
        decimals: 18
    }
};
```

**Action**: ✅ **No changes needed**
**Reason**: This file serves as a fallback/default configuration when the dynamic config from `useContractConfig` is not available. The hardcoded values here are appropriate as they ensure the application continues to work even when the API is down or the proposal config is missing.

**Note**: Components should use the pattern:
```javascript
const config = useContractConfig();
const baseTokens = config?.BASE_TOKENS_CONFIG || DEFAULT_BASE_TOKENS_CONFIG;
```

---

## Prop Passing Requirements

### PropTypes Updates
Components need to accept `proposalId` as a prop. Update PropTypes:

**ShowcaseSwapComponent.jsx:**
```javascript
ShowcaseSwapComponent.propTypes = {
  positions: PropTypes.object,
  prices: PropTypes.object,
  walletBalances: PropTypes.object,
  isLoadingBalances: PropTypes.bool,
  account: PropTypes.string,
  isConnected: PropTypes.bool,
  onConnectWallet: PropTypes.func,
  proposalId: PropTypes.string.isRequired, // Add this
};
```

**CollateralModal.jsx:**
```javascript
CollateralModal.propTypes = {
  // ... existing props ...
  proposalId: PropTypes.string.isRequired, // Add this
};
```

### Parent Component Updates
Parent components need to pass the `proposalId`:

**Example in MarketPageShowcase.jsx:**
```javascript
<ShowcaseSwapComponent
  positions={positions}
  prices={prices}
  walletBalances={walletBalances}
  isLoadingBalances={isLoadingBalances}
  account={account}
  isConnected={isConnected}
  onConnectWallet={handleConnectWallet}
  proposalId={config?.proposalId || proposalId} // Add this
/>
```

---

## Testing Checklist

### Component-Specific Tests

**ShowcaseSwapComponent.jsx:**
- [ ] Balance display shows dynamic token symbols instead of hardcoded 'SDAI'/'GNO'
- [ ] Error messages use dynamic token names (line 571)
- [ ] formatBalance calls use config-based symbols (lines 1053-1054, 1095-1096)
- [ ] Recovery amount display uses dynamic symbols (lines 1067-1068, 1109-1110)
- [ ] propId is passed correctly to enable config loading

**CollateralModal.jsx:**
- [ ] TokenToggle buttons show dynamic currency/company symbols instead of 'SDAI'/'GNO'
- [ ] formatBalance calls use config-based symbols (lines 1054, 1063)
- [ ] Balance display sections show correct token symbols
- [ ] proposalId is passed correctly to enable config loading

**ConfirmSwapModal.jsx:**
- [ ] ✅ Already correctly implemented (most features)
- [ ] Collateral display section uses dynamic symbols (lines 1755, 1761)
- [ ] Comments updated to use generic references (lines 809, 876, 882)

**MarketPageShowcase.jsx:**
- [ ] Market title templates use dynamic token symbols
- [ ] Error messages use dynamic token names
- [ ] Comments updated to use generic token references

### Integration Tests
- [ ] All token symbols display correctly when config loads successfully
- [ ] Fallback values work when config API is unavailable
- [ ] Balance calculations use correct token symbols from different proposals
- [ ] Components work with different token configurations (PNK/sDAI vs GNO/sDAI)
- [ ] Error messages show correct token names for different proposals
- [ ] Transaction confirmations use correct symbols
- [ ] "Get Token" links use correct symbols and URLs

---

## Priority Summary

### High Priority (Must Fix)
1. **ShowcaseSwapComponent.jsx**: Lines 173-178, 244, 267-268, 571, 928, 946, 986, 1053-1054, 1095-1096, 1067-1068, 1109-1110
2. **CollateralModal.jsx**: Lines 51, 60, 1054, 1063
3. **ConfirmSwapModal.jsx**: Lines 1755, 1761

### Medium Priority (Should Fix)
1. **MarketPageShowcase.jsx**: Lines 1013, 1018-1019, 1350, 2315
2. **Comments and logging**: Update hardcoded token references in comments

### Low Priority (Optional)
1. Update balance structure to use generic property names
2. Add TypeScript interfaces for better type safety

---

## Notes

1. **Fallback Strategy**: Always provide fallback values in case config is not loaded
2. **Loading States**: Consider loading states while config is being fetched
3. **Type Safety**: Consider adding TypeScript interfaces for the config structure
4. **Caching**: The config should be cached to avoid repeated API calls
5. **Error Handling**: Handle cases where token information is missing from config
6. **Constants File**: The `constants/contracts.js` file should remain unchanged as it provides appropriate fallback values 