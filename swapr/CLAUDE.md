# CLAUDE.md - Swapr Pool Automation

This file provides guidance to Claude Code (claude.ai/code) when working with the pool automation tools in the swapr directory.

## Overview

The swapr directory contains automated tools for creating and managing futarchy prediction market pools on Gnosis Chain. These tools orchestrate the complete workflow from proposal creation through pool setup to API integration.

## Key Files

### Core Automation Scripts

1. **automate-futarchy.js**
   - Main orchestration script that runs the complete workflow
   - Executes: `futarchy:auto:config` (on-chain setup) → `generate-pools` → `call-proposal-pools`
   - Usage: `npm run automate`, or `npm run automate-dry` to preview only the API calls
     (the on-chain setup step still runs and sends transactions)

2. **algebra-cli.js**
   - Core pool management engine with blockchain interactions
   - Handles token splitting, pool creation, liquidity management
   - Interactive mode: `npm run interactive`
   - Auto mode: `npm run futarchy:auto futarchy-config.json`
   - Creating a proposal requires an explicit `openingTime` (UNIX seconds, when the
     Reality.eth question opens for answers): auto mode aborts if the config has
     none, interactive mode asks for it. There is no default
   - Fixed gas limits per operation (`GAS_CONFIG.GAS_LIMITS`): create pool 9M,
     mint position 2M, split 1.5M, create proposal 5M. Gnosis blocks hold 17M gas,
     so larger limits leave transactions pending when the chain is busy

3. **generate-pool-files.js**
   - Converts futarchy setup data to API-ready JSON files
   - Filters for target pools: YES_GNO/YES_sDAI, NO_GNO/NO_sDAI, YES_sDAI/sDAI
   - Usage: `npm run generate-pools`

4. **call-pool-apis.js**
   - Makes HTTP POST requests to create pools via API
   - Supports authentication and dry-run mode
   - Usage: `npm run call-pool-apis` or `npm run call-pool-apis-dry`
   - `call-pools-by-proposal.js` does the same for one proposal
     (`npm run call-proposal-pools <addr>`)

5. **clear-pending.js**
   - Clears a transaction of the CLI wallet that is stuck pending, by sending a
     zero-value transfer to itself with the same nonce and a higher fee
   - `node clear-pending.js` shows what is pending and sends nothing;
     `node clear-pending.js --send` replaces the oldest pending transaction

## Configuration

### futarchy-config.json Structure
```json
{
  "marketName": "Proposal title",
  "openingTime": unix_timestamp,   // Required when the config creates a proposal
  "display_text_1": "First line",
  "display_text_2": "Second line",
  "companyToken": {              // Company token configuration
    "symbol": "GNO",
    "address": "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb"
  },
  "currencyToken": {             // Currency token configuration
    "symbol": "sDAI",
    "address": "0xaf204776c7245bF4147c2612BF6e5972Ee483701"
  },
  "spotPrice": 100,              // Current market price
  "eventProbability": 0.5,       // Initial YES probability (0-1)
  "impact": 6.38,                // Expected price impact %
  "liquidityAmounts": [],        // 6 values for initial liquidity
  "forceAddLiquidity": [],       // Override liquidity for specific pools
  "adapterAddress": "0x...",     // ConditionalTokensAdapter
  "companyId": "10"              // Optional company identifier
}
```

**Token Configuration:**
- `companyToken`: The governance/company token (e.g., GNO, PNK)
- `currencyToken`: The base currency token (e.g., sDAI, USDC)
- Both support nested object format (shown above) or flat format for backward compatibility:
  - `companyTokenAddress`: "0x..."
  - `currencyTokenAddress`: "0x..."

### Pool Creation Parameters

The system creates 6 pools based on configuration:

1. **Conditional Token Pools** (correlated prices):
   - YES_COMPANY/YES_CURRENCY
   - NO_COMPANY/NO_CURRENCY

2. **Expected Value Pools** (company token markets):
   - YES_COMPANY/BASE_CURRENCY
   - NO_COMPANY/BASE_CURRENCY

3. **Prediction Market Pools** (probability markets):
   - YES_CURRENCY/BASE_CURRENCY
   - NO_CURRENCY/BASE_CURRENCY

### Price Calculation
- YES Price = spotPrice × (1 + impact × (1 - probability))
- NO Price = spotPrice × (1 - impact × probability)

## Common Workflows

### 1. Complete Automated Setup
```bash
# Full automation with futarchy-config.json
npm run automate

# Dry run to preview without executing
npm run automate-dry
```

The automation workflow will:
- Read token configuration from futarchy-config.json
- Display configured tokens (e.g., GNO/sDAI or PNK/USDC)
- Create pools with the specified tokens
- Generate API files for the correct pool pairs

### 2. Manual Pool Creation
```bash
# Interactive wizard
npm run interactive

# Automated with config
npm run futarchy:auto futarchy-config.json
```

### 3. Liquidity Management
```bash
# Add liquidity interactively
npm run interactive
# Select option 0 (Add Liquidity)

# Remove liquidity
npm run remove
```

### 4. API Integration Only
```bash
# Generate pool files from latest setup
npm run generate-pools

# Call APIs with generated files
npm run call-pool-apis
```

## Important Functions

### algebra-cli.js

**`setupFutarchyPoolsAuto <configFile>`** (command)
- Main entry point for automated setup
- Reads the config (`readConfigFile`, `parseConfigValues`), calls
  `createNewProposal(true, config)` when no `proposalAddress` is given, then
  `setupPoolsFromFutarchyProposal(proposalAddress, config)`
- Handles all 6 pool types automatically

**splitTokensViaAdapter(tokenToObtainSymbol, tokenToObtainAddr, amountNeededWei, underlyingTokenSymbol, underlyingTokenAddr, futarchyAdapterContract, proposalContractAddr)**
- Splits the underlying token through the adapter when the wallet holds less of
  the conditional token than needed
- Handles allowances through `ensureAllowance`

**addLiquidity(t0Addr, t1Addr, poolAddr, defaultAmt0, defaultAmt1, autoMode)**
- Adds liquidity with price verification
- Supports inverted token pairs

**createNewProposal(autoMode, config)**
- Creates new futarchy proposal through the factory
- Returns proposal address
- Requires `openingTime` (see above)

### automate-futarchy.js

**main()**
- Orchestrates complete workflow by running the npm scripts in order
- `--dry-run` switches only the API step to its preview script

### generate-pool-files.js

**generatePoolFile(poolData, proposalData, poolIndex, allPools, companyId, config)**
- Writes the API payload for one pool from the latest `futarchy-pool-setup-*.json`
- Includes `companyId` from `futarchy-config.json` in the first pool's metadata

## Error Handling

Common issues and solutions:

1. **Insufficient Balance**
   - Check token balances before operations
   - Ensure collateral tokens are available

2. **Pool Already Exists**
   - System detects existing pools
   - Can reuse or create new proposal

3. **Price Calculation Errors**
   - Verify Balancer pool has liquidity
   - Check RPC endpoints are responsive

4. **API Failures**
   - Check `JWT` / `BEARER_TOKEN` and `POOL_CREATION_URL` in .env
   - Verify API endpoint is correct
   - Use dry-run mode for testing

5. **Transaction Stuck Pending**
   - Later runs queue behind it; inspect and replace it with `clear-pending.js`

## Security Notes

1. **Private Keys**
   - Store in .env file only
   - Never commit to repository
   - Use separate keys for testing

2. **Gas Management**
   - Gas limits are fixed per operation in `GAS_CONFIG.GAS_LIMITS` (`algebra-cli.js`)
   - Gas price is automatic; `GAS_PRICE_GWEI` in .env pins it

3. **Allowances**
   - `ensureAllowance` skips the approval when the current allowance is enough
   - It approves the exact amount needed; `APPROVE_MAX=true` in .env switches to
     unlimited approvals

## Testing Approach

1. **Dry Run Mode**
   - `npm run call-pool-apis-dry` / `npm run call-proposal-pools-dry <addr>` send nothing
   - `npm run automate-dry` previews the API calls only; its first step still
     creates pools on-chain

2. **Manual Verification**
   - Check pool creation on explorer
   - Verify prices match calculations
   - Test swaps manually

3. **API Testing**
   - Use `npm run call-pool-apis-dry`
   - Verify request formatting
   - Check authentication

## Development Commands

```bash
# Main automation
npm run automate           # Full workflow
npm run automate-dry       # Preview mode

# Pool operations
npm run futarchy:create    # Create proposal
npm run futarchy:auto      # Auto setup with config
npm run interactive        # Interactive wizard

# API operations
npm run generate-pools     # Generate API files
npm run call-pool-apis     # Execute API calls
npm run call-pool-apis-dry # Preview API calls

# Utilities
npm run view              # View positions
npm run remove            # Remove liquidity
npm run merge <addr>      # Merge conditional tokens
```

## Integration with Main App

The main app does not import anything from this directory. It reads a market's
proposal, pool and token addresses at runtime from the registry and subgraph:
- `src/hooks/useContractConfig.js` (through `src/adapters/`) - market configuration
- `src/utils/seerSwap.js` - quotes and executes trades in those pools through `@seer-pm/sdk`
- `futarchy-sdk/executors/FutarchyCartridge.js` - split, merge and redeem

## Important Constants

Key addresses and values are in:
- `algebra-cli.js` (top of file) - default token, factory and adapter addresses
  (`DEFAULT_COMPANY_TOKEN`, `DEFAULT_FACTORY_ADDRESS`, `DEFAULT_ADAPTER_ADDRESS`, ...), ABIs, `GAS_CONFIG`
- `futarchy-config.json` - Market parameters
- `.env` - `PRIVATE_KEY`, `RPC_URL`, API URL and token (see `env.example`)
