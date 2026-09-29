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
npm run auto-qa:test:unit  # Deterministic node:test suite (auto-qa/tests/), runs in CI
npm run auto-qa:test:live  # Live-endpoint tier (auto-qa/live/), manual or weekly schedule
npx cypress run            # Cypress E2E (cypress/e2e/, minimal)

# Storybook
npm run storybook        # Start Storybook dev server (http://localhost:6006)
npm run build-storybook  # Build Storybook static site

# Utilities
npm run start-proposal   # Run proposal CLI in interactive mode
npm run getpoolprice     # Get current Algebra pool prices
npm run generate-seo     # Regenerate SEO data (build-with-seo runs it before build)
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
- **Frontend**: Next.js 14 with React 18 (pages router), static export (`output: 'export'` in `next.config.mjs`, served from `out/`)
- **Blockchain**: Ethers.js v5 (main app), v6 (swapr CLI), Wagmi v2, RainbowKit
- **Styling**: Tailwind CSS, CSS Modules, PrimeReact components
- **State Management**: React Context API, TanStack Query
- **Package Manager**: npm (`package-lock.json`; Netlify runs `npm install --legacy-peer-deps`).

### Key Directories

```
src/
├── pages/              # Next.js pages (routing); markets/[address].js is the market page
├── components/
│   └── futarchyFi/    # Main app components (marketPage/, companyList/, ...)
├── hooks/             # Custom React hooks (useContractConfig, usePoolData, ...)
├── adapters/          # Registry / subgraph -> app config adapters
├── services/          # Shared GraphQL fetchers + request dedup (requestCache.js)
├── config/            # markets.js (static market pages), rpcEndpoints.js, subgraphEndpoints.js
├── contexts/          # React contexts
├── utils/             # Utility functions
├── providers/         # Wagmi / RainbowKit providers
└── futarchyJS/        # Legacy futarchy logic (not imported by the app)

futarchy-sdk/          # Swap/split/merge executors ("cartridges"), imported as futarchy-sdk/* (jsconfig paths)
auto-qa/               # node:test suites (tests/ = CI tier, live/ = network tier) and tools
swapr/                 # Pool automation CLI tools (algebra-cli.js entry point)
```

### Critical Files

1. **Market page** (`src/components/futarchyFi/marketPage/`)
   - `MarketPageShowcase.jsx` — page shell, loaded by `pages/markets/[address].js`
   - `ShowcaseSwapComponent.jsx` → `ConfirmSwapModal.jsx` — trade flow
   - `collateralModal/` (split/merge collateral), `redeemTokens/` (redemption)
   - Market configuration comes from `src/hooks/useContractConfig.js`
     (registry + subgraph via `src/adapters/`)
   - `src/hooks/useFutarchy.js` / `useSmartSwap.js` are legacy and unused

2. **Transaction execution**: `futarchy-sdk/executors/`
   - Cartridges per protocol: `SwaprAlgebraCartridge`, `UniswapRouterCartridge`,
     `FutarchyCartridge` (split/merge/redeem), `CoWSwapCartridge`, ...

3. **Web3 Integration**:
   - `src/providers/providers.jsx` - Wagmi configuration
   - `src/config/rpcEndpoints.js` - the one RPC list per chain (configured endpoint first, public fallback)
   - `src/utils/getBestRpc.js` - one shared ethers provider per chain with failover

4. **Pool Automation**: `swapr/algebra-cli.js`
   - CLI tool for automated pool creation
   - Supports both interactive and config-based operation
   - Note: Uses ethers v6 (vs v5 in main app)

### Important Patterns

1. **Cartridges for transactions**
   - One class per protocol in `futarchy-sdk/executors/`; `ConfirmSwapModal.jsx`
     picks one per trade and runs its step generator (approve, swap, ...)

2. **RPC Resilience**
   - Endpoint list in `config/rpcEndpoints.js`, shared by `providers.jsx` and `getBestRpc.js`
   - Custom retry logic in `utils/retryWithBackoff.js`
   - RPC rotation in `utils/getAlgebraPoolPrice.js`

3. **GraphQL data**
   - Endpoints derive from `NEXT_PUBLIC_FUTARCHY_API_URL` (`config/subgraphEndpoints.js`)
   - Shared queries in `src/services/`, deduplicated per page load via `requestCache.js`

4. **Token Management**
   - Conditional tokens (YES/NO pairs)
   - Automatic collateral management
   - ERC20 approval handling with security measures

### Smart Contract Addresses (Gnosis Chain)

Per-market addresses (proposal, pools, tokens) come from the registry and
subgraph at runtime (`useContractConfig`). Static defaults and ABIs live in:
- `src/components/futarchyFi/marketPage/constants/contracts.js`

### Environment Configuration

Required environment variables:
- `NEXT_PUBLIC_GNOSIS_RPC_URL` - Gnosis Chain RPC URL (frontend)
- `NEXT_PUBLIC_MAINNET_RPC_URL` - Ethereum mainnet RPC URL (frontend)
  Both are optional: a configured endpoint is tried first and the public
  endpoints remain as fallbacks.
- `RPC_URL` - RPC URL for backend/CLI tools
- Additional API keys for external services (Supabase, etc.)

RPC endpoints per chain (`src/config/rpcEndpoints.js`), in priority order:
- Gnosis: `NEXT_PUBLIC_GNOSIS_RPC_URL` (if set), then `https://rpc.gnosischain.com`
- Ethereum: `NEXT_PUBLIC_MAINNET_RPC_URL` (if set), then `https://ethereum-rpc.publicnode.com`

`NEXT_PUBLIC_*` values are inlined at build time (static export), so they must
be present where the build runs. Netlify sets them in `netlify.toml`.

### Testing Approach

- **Unit Testing**: Node's built-in `node:test` in `auto-qa/tests/` (mostly source-pinning
  and pure-logic specs; no live network). Run `npm run auto-qa:test:unit`.
- **Live checks**: `auto-qa/live/` (endpoint liveness, GraphQL schema compatibility)
- **E2E Testing**: Cypress (minimal coverage)
- **Component Testing**: Storybook for visual testing
- **Smart Contract Testing**: Hardhat tests in `index/test/`
- **Lint**: `npm run lint`; the build ignores lint errors (`ignoreDuringBuilds`)

### Common Development Tasks

1. **Adding a New Swap Protocol**
   - Add a cartridge in `futarchy-sdk/executors/` (see `SwaprAlgebraCartridge.js`)
   - Select it in `ConfirmSwapModal.jsx`

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

Netlify builds and hosts the site (`netlify.toml`): `npm install --legacy-peer-deps
&& npm run build`, publishing the static export in `out/`. Deploy previews are
built for pull requests. Redirects and security headers are also set there.

GitHub Actions only runs tests: `.github/workflows/auto-qa.yml` runs the unit
tier on PRs/pushes touching `auto-qa/**` or `package.json`;
`auto-qa-live.yml` runs the live tier on a schedule or manual dispatch.

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