# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the web interface for futarchy markets on Gnosis Chain (100) and Ethereum mainnet (1). A proposal splits collateral into conditional YES/NO tokens, which trade in AMM pools (Swapr/Algebra on Gnosis, Uniswap on Ethereum). The app lists companies and proposals, shows market charts, and lets a wallet trade, split/merge collateral and redeem.

## Development Commands

### Main Application (Root Directory)
```bash
# Development
npm run dev               # Start Next.js development server (http://localhost:3000)

# Build
npm run build            # Static export into out/ (postbuild writes the sitemap)
                         # `next start` cannot serve a static export; serve out/ instead

# Code Quality
npm run lint             # next lint (ESLint, .eslintrc.json); exits non-zero on errors only

# Testing
npm run auto-qa:test:unit  # Deterministic node:test suite (auto-qa/tests/), runs in CI
npm run auto-qa:test:live  # Live-endpoint tier (auto-qa/live/), manual or weekly schedule
npx cypress run            # Cypress E2E (cypress/e2e/, one spec)

# Storybook
npm run storybook        # Start Storybook dev server (http://localhost:6006)
npm run build-storybook  # Build Storybook static site

# Utilities
npm run start-proposal   # scripts/proposal-cli.js, interactive proposal CLI
npm run getpoolprice     # getAlgebraPoolPrice.js (repo root): price of one hardcoded Algebra pool
npm run generate-seo     # Regenerate SEO data (build-with-seo runs it before build)
```

### Pool Automation (swapr/ Directory)
See `swapr/CLAUDE.md`. Entry point `swapr/algebra-cli.js` (ethers v6, its own `package.json`).
```bash
cd swapr/
npm run interactive                         # Interactive wizard
npm run futarchy:auto futarchy-config.json  # Proposal + pools + liquidity from a config
npm run view                                # View positions
npm run remove                              # Remove liquidity
npm run merge <proposalAddr>                # Merge conditional tokens back to collateral
```

## Code Architecture

### Tech Stack
- **Frontend**: Next.js 14 with React 18 (pages router), static export (`output: 'export'` in `next.config.mjs`, served from `out/`)
- **Blockchain**: Ethers.js v5 and viem (main app), Wagmi v2, RainbowKit, `@seer-pm/sdk` for swaps; ethers v6 in the swapr CLI
- **Styling**: Tailwind CSS, CSS Modules
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
├── utils/             # Utility functions (seerSwap.js, approvalAmount.js, getBestRpc.js, ...)
├── providers/         # Wagmi / RainbowKit providers
└── ops/               # Components and actions for the /ops page

futarchy-sdk/          # Executors ("cartridges"), imported as futarchy-sdk/* (jsconfig paths)
auto-qa/               # node:test suites (tests/ = CI tier, live/ = network tier) and tools
swapr/                 # Pool automation CLI tools (algebra-cli.js entry point)
docs/                  # Notes and integration write-ups; docs/archive/ holds old one-off files
```

### Critical Files

1. **Market page** (`src/components/futarchyFi/marketPage/`)
   - `MarketPageShowcase.jsx`: page shell (about 400 lines), loaded by
     `pages/markets/[address].js`. It composes the hooks (`useMarketData`,
     `useMarketBalances`, `useCollateralFlow`, ...) and sections (`MarketHero`,
     `MarketChartSection`, `MarketTabsSection`, `MarketModals`, ...) in `showcase/`
   - `ShowcaseSwapComponent.jsx` (trade panel) → `ConfirmSwapModal.jsx` (trade dialog)
   - `collateralModal/` (split/merge collateral), `redeemTokens/` (redemption)
   - Market configuration comes from `src/hooks/useContractConfig.js`
     (registry + subgraph via `src/adapters/`)

2. **Trades**: `src/utils/seerSwap.js`
   - `quoteSeerSwap` / `executeSeerSwap` wrap `@seer-pm/sdk`: Seer's on-chain Lens
     quoter picks the route and returns calldata for the DEX router (Swapr on
     Gnosis, Uniswap on Ethereum). The quoted minimum and the calldata come from
     the same call
   - The trade panel takes amounts from that quote; a separate pool quote run in
     parallel (`utils/FutarchyQuoteHelper.js` on Gnosis) supplies current price,
     price after and impact

3. **Split, merge, redeem**: `futarchy-sdk/executors/FutarchyCartridge.js`
   - Used by `CollateralModal.jsx` and `RedemptionModal.jsx`. It is the only
     executor the app imports; the other cartridges in `futarchy-sdk/executors/`
     (`SwaprAlgebraCartridge`, `UniswapRouterCartridge`, `CoWSwapCartridge`, ...)
     are not used by `src/`

4. **Web3 Integration**:
   - `src/providers/providers.jsx` - Wagmi configuration
   - `src/config/rpcEndpoints.js` - the one RPC list per chain (configured endpoint first, public fallback)
   - `src/utils/getBestRpc.js` - one shared ethers provider per chain with failover

5. **Pool Automation**: `swapr/algebra-cli.js`
   - CLI tool for proposal and pool creation, interactive or config-based
   - Note: Uses ethers v6 (vs v5 in main app)

### Important Patterns

1. **Swaps go through `seerSwap.js`**
   - One code path for both chains. Approvals are plain ERC20 `approve()` to the
     router the quote names (no Permit2)
   - A quote's calldata carries a five-minute deadline; `executeSeerSwap`
     re-quotes just before sending when an approval was needed or the quote is
     older than `MAX_QUOTE_AGE_MS`

2. **Approvals are exact by default**
   - `src/utils/approvalAmount.js` (`approvalAmountFor`) returns the exact amount
     an operation needs; `MaxUint256` only when the user opts in to unlimited
     approval in the dialog

3. **RPC Resilience**
   - Endpoint list in `config/rpcEndpoints.js`, shared by `providers.jsx`, `getBestRpc.js` and `seerSwap.js`
   - RPC rotation in `utils/getAlgebraPoolPrice.js`
   - `utils/retryWithBackoff.js` exists but nothing in `src/` imports it

4. **GraphQL data**
   - Endpoints derive from `NEXT_PUBLIC_FUTARCHY_API_URL` (`config/subgraphEndpoints.js`)
   - Shared queries in `src/services/`, deduplicated per page load via `requestCache.js`

### Smart Contract Addresses

Per-market addresses (proposal, pools, tokens) come from the registry and
subgraph at runtime (`useContractConfig`). Static defaults and ABIs live in:
- `src/components/futarchyFi/marketPage/constants/contracts.js`

### Environment Configuration

Environment variables:
- `NEXT_PUBLIC_FUTARCHY_API_URL` - host serving `/registry/graphql` and
  `/candles/graphql` (default `https://api.futarchy.seer.pm`)
- `NEXT_PUBLIC_GNOSIS_RPC_URL` - Gnosis Chain RPC URL (frontend)
- `NEXT_PUBLIC_MAINNET_RPC_URL` - Ethereum mainnet RPC URL (frontend)
  Both RPC variables are optional: a configured endpoint is tried first and the
  public endpoints remain as fallbacks.
- `RPC_URL`, `PRIVATE_KEY` - swapr CLI tools (`swapr/.env`, see `swapr/env.example`)

RPC endpoints per chain (`src/config/rpcEndpoints.js`), in priority order:
- Gnosis: `NEXT_PUBLIC_GNOSIS_RPC_URL` (if set), then `https://rpc.gnosischain.com`
- Ethereum: `NEXT_PUBLIC_MAINNET_RPC_URL` (if set), then `https://ethereum-rpc.publicnode.com`

`NEXT_PUBLIC_*` values are inlined at build time (static export), so they must
be present where the build runs. Netlify sets them in `netlify.toml`.

### Testing Approach

- **Unit tier**: Node's built-in `node:test` in `auto-qa/tests/` (775 tests, mostly
  source-pinning and pure-logic specs; no live network). Run `npm run auto-qa:test:unit`.
  Tests read source files by path, so moving or renaming a pinned file needs the test updated.
- **Live tier**: `npm run auto-qa:test:live` runs `auto-qa/live/` (endpoint liveness,
  GraphQL schema compatibility). The GraphQL probe resolves the API host through
  `auto-qa/tools/api-base.mjs`: `AUTO_QA_API_BASE`, then `NEXT_PUBLIC_FUTARCHY_API_URL`,
  then `DEFAULT_API_BASE` in `src/config/subgraphEndpoints.js`.
- **E2E Testing**: Cypress (one spec in `cypress/e2e/`)
- **Component Testing**: Storybook stories next to components
- **Smart Contract Testing**: Hardhat tests in `index/test/`
- **Lint**: `npm run lint`. The Netlify build ignores lint (`ignoreDuringBuilds` in
  `next.config.mjs`); CI runs it and fails on errors.

### Common Development Tasks

1. **Changing the swap route**
   - Routing is decided by `@seer-pm/sdk` inside `src/utils/seerSwap.js`; the
     trade panel and dialog only consume its quote. Supporting another chain
     means adding it to `VIEM_CHAINS`, `SEER_ROUTE_NAMES` and
     `SEER_DEFAULT_SWAP_ROUTER` there and to `config/rpcEndpoints.js`

2. **Working with Hooks**
   - Shared hooks go in `src/hooks/`; hooks used only by the market page go in
     `marketPage/showcase/`

3. **Blockchain Interactions**
   - Use ethers.js v5 in main app (NOT v6)
   - Use ethers.js v6 in swapr CLI tools
   - The app does not set gas limits on swaps; the wallet estimates gas
   - Approve exact amounts through `approvalAmountFor`

### Deployment

Netlify builds and hosts the site (`netlify.toml`, Node 20): `npm install --legacy-peer-deps
&& npm run build`, publishing the static export in `out/`. Deploy previews are
built for pull requests. Redirects and security headers are also set there.

GitHub Actions does not deploy. `.github/workflows/auto-qa.yml` runs two jobs,
the unit tier and lint, on PRs and pushes to `main` that touch `src/**`,
`futarchy-sdk/**`, `auto-qa/**`, `package.json`, `package-lock.json`,
`.eslintrc.json` or the workflow files. `auto-qa-live.yml` runs the live tier
weekly or by manual dispatch.

### Security Considerations

1. **Token Approvals**
   - Exact-amount approvals by default (`approvalAmountFor`); unlimited is an explicit user opt-in
   - Swap approvals go to the router address returned with the quote

2. **RPC**
   - A configured endpoint first, a public endpoint as fallback (`config/rpcEndpoints.js`)

3. **Transaction Safety**
   - Slippage: the minimum shown in the dialog is the minimum encoded in the swap calldata
   - Deadline: carried in the quote's calldata; stale quotes are rebuilt before sending
