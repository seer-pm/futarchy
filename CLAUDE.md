# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a futarchy prediction market system built on Gnosis Chain, implementing decentralized governance mechanisms through token pairs and automated market makers. The system allows participants to trade on outcomes using conditional tokens split into YES/NO positions.

## Development Commands

### Main Application (Root Directory)
```bash
# Development
npm run dev               # Start Next.js development server (http://localhost:3000)

# Build & Production
npm run build            # Build for production
npm run start            # Start production server

# Code Quality
npm run lint             # Run Next.js linter

# Testing
npm test                 # No test command configured - use Cypress for E2E tests
npx cypress open         # Open Cypress test runner
npx cypress run          # Run Cypress tests headlessly

# Storybook
npm run storybook        # Start Storybook dev server (http://localhost:6006)
npm run build-storybook  # Build Storybook static site

# Utilities
npm run start-proposal   # Run proposal CLI in interactive mode
npm run send-to-supabase # Send data to Supabase
npm run get-trade-history # Retrieve trade history from blockchain
npm run getpoolprice     # Get current Algebra pool prices
```

### Pool Automation (swapr/ Directory)
```bash
cd swapr/

# Interactive Operations
npm run interactive      # Interactive mode wizard
npm run futarchy:create  # Create new proposal
npm run view            # View all positions

# Automated Pool Setup
npm run futarchy:auto futarchy-config.json  # Automatic setup with config
npm run automate        # Full workflow: config → generate → call APIs
npm run automate-dry    # Preview full workflow (safe test)

# Pool API Operations
npm run generate-pools   # Generate API files from latest setup
npm run call-pool-apis   # Make ALL pool creation API calls
npm run call-pool-apis-dry  # Preview API calls (safe test)

# Liquidity Management
npm run remove          # Remove liquidity (interactive)
npm run merge <proposalAddr>  # Merge conditional tokens back to collateral
```

## Code Architecture

### Tech Stack
- **Frontend**: Next.js 14 with React 18 (pages router)
- **Blockchain**: Ethers.js v5 (main app), v6 (swapr CLI), Wagmi v2, RainbowKit
- **Styling**: Tailwind CSS, CSS Modules, PrimeReact components
- **State Management**: React Context API, TanStack Query
- **Package Manager**: pnpm v9.4.0

### Key Directories

```
src/
├── pages/              # Next.js pages (routing)
├── components/         # React components
│   ├── futarchyFi/    # Main app components
│   └── refactor/      # New extensible swap system
├── hooks/             # Custom React hooks
├── contexts/          # React contexts
├── utils/             # Utility functions
├── providers/         # Web3 and app providers
└── futarchyJS/        # Core futarchy logic

swapr/                 # Pool automation CLI tools
├── algebra-cli.js     # Main CLI entry point
├── api-pool-create.js # Pool creation API client
└── futarchy-*.js      # Futarchy-specific modules
```

### Critical Files

1. **Core Hook**: `src/hooks/useFutarchy.js`
   - Central hook managing all futarchy operations
   - Handles swaps, positions, collateral, and balances
   - Extensive callback system for UI updates

2. **Web3 Integration**: 
   - `src/contexts/Web3Context.js` - MetaMask provider wrapper
   - `src/providers/providers.jsx` - Wagmi configuration with multi-RPC fallback

3. **Swap Strategies**: `src/components/refactor/strategies/`
   - Extensible swap system using strategy pattern
   - Support for Algebra/Swapr, CoW Swap protocols
   - Factory pattern for strategy creation

4. **Pool Automation**: `swapr/algebra-cli.js`
   - CLI tool for automated pool creation
   - Supports both interactive and config-based operation
   - Note: Uses ethers v6 (vs v5 in main app)

### Important Patterns

1. **Strategy Pattern for Swaps**
   - Base classes: `BaseSwapStrategy.js`, `BaseRealtimeStrategy.js`
   - Implementations: `AlgebraSwapStrategy.js`, `CowSwapStrategy.js`
   - Factory: `SwapStrategyFactory.js`

2. **RPC Resilience**
   - Multi-RPC fallback configuration in `providers.jsx`
   - Custom retry logic in `utils/retryWithBackoff.js`
   - RPC rotation in `utils/getAlgebraPoolPrice.js`

3. **Token Management**
   - Conditional tokens (YES/NO pairs)
   - Automatic collateral management
   - ERC20 approval handling with security measures

### Smart Contract Addresses (Gnosis Chain)

Key contracts are configured in:
- `src/futarchyJS/futarchyConfig.js` - Main contract addresses
- `src/futarchyJS/contractWrapper.js` - Contract imports and configs
- `src/components/refactor/constants/addresses.js` - Refactored swap addresses

### Environment Configuration

Required environment variables:
- `NEXT_PUBLIC_GNOSIS_RPC_URL` - Gnosis Chain RPC URL (frontend)
- `NEXT_PUBLIC_MAINNET_RPC_URL` - Ethereum mainnet RPC URL (frontend)
  Both are optional: a configured endpoint is tried first and the public
  endpoints remain as fallbacks.
- `RPC_URL` - RPC URL for backend/CLI tools
- Additional API keys for external services (Supabase, etc.)

The app includes multi-RPC fallback for reliability:
```javascript
// Default RPC endpoints (in order of priority)
- https://gnosis.drpc.org
- https://rpc.gnosischain.com
- https://rpc.ankr.com/gnosis
- https://gnosis-mainnet.public.blastapi.io
- https://gnosis-rpc.publicnode.com
- https://1rpc.io/gnosis
```

### Testing Approach

- **E2E Testing**: Cypress (minimal coverage)
- **Component Testing**: Storybook for visual testing
- **Unit Testing**: No framework configured
- **Smart Contract Testing**: Hardhat tests in `index/test/`

### Common Development Tasks

1. **Adding a New Swap Protocol**
   - Create new strategy in `src/components/refactor/strategies/`
   - Extend `BaseSwapStrategy` class
   - Register in `SwapStrategyFactory`

2. **Working with Hooks**
   - Place new hooks in `src/hooks/`
   - Follow callback pattern for UI updates
   - Handle loading states and errors

3. **Blockchain Interactions**
   - Use ethers.js v5 in main app (NOT v6)
   - Use ethers.js v6 in swapr CLI tools
   - Implement proper gas estimation
   - Handle transaction states comprehensively

### Deployment

The project uses GitHub Actions for CI/CD:
- Multiple staging environments (staging-1 through staging-5)
- Production deployment workflow
- Storybook deployment
- No test execution in CI (builds directly)

Deployments go to S3 with CloudFront CDN invalidation.

### Security Considerations

1. **Token Approvals**
   - Reset allowances before setting new ones
   - Use MaxUint256 for frequent operations
   - Clear approval state tracking

2. **RPC Security**
   - Multiple fallback RPCs for reliability
   - Rate limiting protection
   - Error handling for RPC failures

3. **Transaction Safety**
   - Slippage protection on swaps
   - Gas estimation with buffer
   - Deadline enforcement