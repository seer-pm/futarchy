# Futarchy Web - Complete Project Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Quick Start](#quick-start)
3. [System Architecture](#system-architecture)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Core Features](#core-features)
7. [Development Guide](#development-guide)
8. [Deployment](#deployment)
9. [API Reference](#api-reference)
10. [Troubleshooting](#troubleshooting)

---

## Project Overview

**Futarchy Web** is a decentralized prediction market system implementing futarchy governance mechanisms on Gnosis Chain. The platform enables participants to trade on outcomes using conditional tokens (YES/NO positions) through automated market makers.

### What is Futarchy?

Futarchy is a governance system where decisions are made based on prediction markets. Instead of voting directly on proposals, participants trade tokens representing different outcomes, and the market's collective wisdom determines the best course of action.

### Key Concepts

- **Currency Tokens (SDAI)**: Savings DAI tokens used as base currency
- **Company Tokens (GNO)**: Gnosis tokens representing company equity
- **Conditional Tokens**: YES/NO position tokens for each outcome
- **Position Management**: Split base tokens into YES/NO pairs or merge them back
- **Automated Market Making**: Integration with SushiSwap and other DEX protocols

---

## Quick Start

### Prerequisites

- Node.js v14 or higher
- npm or pnpm package manager
- MetaMask or compatible Web3 wallet
- Access to Gnosis Chain (Chain ID: 100)

### Installation

```bash
# Clone the repository
git clone git@github.com:futarchy-fi/futarchy-web.git
cd futarchy-web

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

### Available Commands

```bash
# Development
npm run dev               # Start Next.js development server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run linter

# Storybook (Component Development)
npm run storybook        # Start Storybook at http://localhost:6006
npm run build-storybook  # Build Storybook static site

# Utilities
npm run start-proposal   # Run proposal CLI tool
npm run send-to-supabase # Send data to Supabase
npm run generate-seo     # Generate SEO metadata
```

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Pages/UI   │  │    Hooks     │  │   Context    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   Web3 Integration Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Wagmi/Viem  │  │  Ethers.js   │  │ RainbowKit   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                     Gnosis Chain (RPC)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Futarchy   │  │   SushiSwap  │  │   CoW Swap   │      │
│  │   Router     │  │   Router     │  │   Protocol   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Supabase   │  │  Reality.io  │  │  Snapshot    │      │
│  │   Database   │  │   Oracle     │  │  Governance  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Core Components Flow

1. **User Interface** → React components in Next.js pages
2. **State Management** → React Context API + Custom Hooks
3. **Blockchain Interaction** → Ethers.js + Wagmi
4. **Smart Contracts** → Futarchy Router, DEX Routers, Token Contracts
5. **Data Persistence** → Supabase for off-chain data
6. **Oracle** → Reality.io for proposal outcomes

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.2.33 | React framework with SSR/SSG |
| React | 18.x | UI library |
| Tailwind CSS | 3.4.4 | Utility-first CSS framework |
| Framer Motion | 11.11.17 | Animation library |
| Chart.js | 4.4.3 | Data visualization |

### Web3 & Blockchain

| Technology | Version | Purpose |
|------------|---------|---------|
| Ethers.js | 5.7.2 | Ethereum library |
| Wagmi | 2.14.6 | React hooks for Ethereum |
| Viem | 2.22.3 | TypeScript Ethereum interface |
| RainbowKit | 2.2.1 | Wallet connection UI |

### Data & APIs

| Technology | Purpose |
|------------|---------|
| Supabase | PostgreSQL database & real-time subscriptions |
| Axios | HTTP client |
| GraphQL | API queries |
| React Query | Server state management |

### Development Tools

| Tool | Purpose |
|------|---------|
| Storybook | Component development & documentation |
| ESLint | Code linting |
| Cypress | E2E testing framework |
| pnpm | Package manager |

---

## Project Structure

```
futarchy-web/
│
├── .github/              # GitHub workflows and configurations
├── .storybook/           # Storybook configuration
├── abis/                 # Smart contract ABIs
├── app/                  # Next.js app directory (new pages)
├── companies/            # Company-specific configurations
├── contexts/             # React contexts (legacy)
├── cypress/              # E2E test files
├── docs/                 # Additional documentation
├── futarchy-sdk/         # Futarchy JavaScript SDK
├── interfaces/           # TypeScript interfaces
├── public/               # Static assets
├── scripts/              # Build and utility scripts
├── src/                  # Main source code
│   ├── app/              # Next.js app routes
│   ├── components/       # React components
│   │   ├── futarchyFi/   # Main application components
│   │   ├── refactor/     # Refactored swap system
│   │   ├── layout/       # Layout components
│   │   └── supabase/     # Supabase integration components
│   ├── contexts/         # React contexts
│   ├── futarchyJS/       # Core futarchy logic
│   ├── hooks/            # Custom React hooks
│   ├── pages/            # Next.js pages (pages router)
│   ├── providers/        # React providers
│   ├── stories/          # Storybook stories
│   └── utils/            # Utility functions
│
├── styles/               # Global styles
├── supabase/             # Supabase configurations
├── swapr/                # Pool automation CLI tools
│
├── .env.example          # Environment variables template
├── .eslintrc.json        # ESLint configuration
├── next.config.mjs       # Next.js configuration
├── package.json          # Dependencies and scripts
├── tailwind.config.js    # Tailwind CSS configuration
├── tsconfig.json         # TypeScript configuration
└── README.md             # Project README

```

### Key Directories Explained

#### `/src/components/`

- **futarchyFi/** - Main application components for the futarchy interface
- **refactor/** - New extensible swap system using strategy pattern
  - `strategies/` - Different swap protocol implementations
  - `context/` - Context providers for proposal data
  - `constants/` - Contract addresses and configurations
- **layout/** - Page layouts and navigation components
- **supabase/** - Components for Supabase authentication and data

#### `/src/hooks/`

Custom React hooks for:
- `useFutarchy.js` - Main hook for futarchy operations
- Wallet connections
- Balance tracking
- Transaction management

#### `/src/futarchyJS/`

Core futarchy logic:
- Token management
- Position calculations
- Contract interactions
- Configuration

#### `/swapr/`

CLI tools for automated pool management:
- `algebra-cli.js` - Interactive pool creation and management
- Configuration files for automated setup

---

## Core Features

### 1. Position Management

Users can manage their positions in the prediction market:

**Opening Positions**
- Split base tokens (SDAI or GNO) into YES/NO pairs
- Requires approval of base token
- Creates equal amounts of YES and NO tokens

**Closing Positions**
- Merge YES/NO pairs back into base tokens
- Requires equal amounts of both YES and NO tokens
- Burns conditional tokens and returns base tokens

**Example Flow:**
```javascript
// Add 10 SDAI as collateral (splits into YES_SDAI and NO_SDAI)
await addCollateral('currency', '10.0')

// Later, remove 5 SDAI worth of collateral
await removeCollateral('currency', '5.0')
```

### 2. Token Swapping

Execute swaps between different outcome tokens:

**Supported Protocols:**
- SushiSwap V3 (default)
- SushiSwap V2
- CoW Swap (order-based)
- Algebra DEX

**Smart Swap Features:**
- Automatic collateral management
- Route optimization
- Slippage protection
- Gas estimation
- Multi-step approval handling

**Example:**
```javascript
// Buy YES company tokens using currency collateral
await smartSwap({
  tokenType: 'currency',
  amount: '1.0',
  eventHappens: true,  // YES position
  action: 'buy'
})
```

### 3. Balance Tracking

Real-time balance monitoring for:
- Wallet balances (base tokens)
- Position balances (YES/NO tokens)
- Available collateral
- Surplus calculations

**Auto-refresh capability:**
```javascript
startAutoRefresh()  // Enable periodic balance updates
stopAutoRefresh()   // Disable auto-refresh
```

### 4. Proposal Management

Create and manage futarchy proposals:
- Link to Snapshot governance
- Reality.io oracle integration
- Market event tracking
- Voting period management

**CLI Tool:**
```bash
npm run start-proposal
# Interactive wizard for proposal data retrieval
```

### 5. Liquidity Pool Management

Automated pool creation and management:

```bash
cd swapr/

# Interactive mode
npm run interactive

# Automated setup from config
npm run futarchy:auto futarchy-config.json

# View all positions
npm run view

# Remove liquidity
npm run remove
```

---

## Development Guide

### Setting Up Development Environment

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Environment Variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
NEXT_PUBLIC_GNOSIS_RPC_URL=https://rpc.gnosischain.com
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
NEXT_PUBLIC_GA_MEASUREMENT_ID=your_ga_id
```

3. **Start Development Server**
```bash
npm run dev
```

### Code Style Guidelines

**React Components:**
- Use functional components with hooks
- Follow naming convention: `ComponentName.jsx`
- Implement proper prop types or TypeScript interfaces
- Use Tailwind CSS for styling

**Hooks:**
- Prefix with `use` (e.g., `useFutarchy`)
- Return object with named properties
- Include loading and error states
- Provide callback mechanisms for UI updates

**Smart Contract Interactions:**
- Always handle errors gracefully
- Implement proper gas estimation
- Use appropriate slippage tolerance
- Track transaction states comprehensively

### Adding a New Swap Strategy

1. Create new strategy file in `src/components/refactor/strategies/`:

```javascript
import BaseSwapStrategy from './BaseSwapStrategy';

export default class MySwapStrategy extends BaseSwapStrategy {
  async initialize() {
    // Setup logic
  }

  async getQuote(params) {
    // Quote logic
  }

  async executeSwap(params) {
    // Swap execution logic
  }
}
```

2. Register in `SwapStrategyFactory.js`:

```javascript
case 'myswap':
  return new MySwapStrategy(provider, signer);
```

3. Add configuration in constants/addresses.js

### Working with Supabase

The project uses Supabase for:
- User authentication
- Proposal metadata
- Market events
- Historical data

**Key Tables:**
- `proposals` - Proposal information
- `market_events` - Trading events
- `market_event_proposal_links` - Link between Snapshot and markets
- `pool_candles` - Price history data

**Example Query:**
```javascript
const { data, error } = await supabase
  .from('proposals')
  .select('*')
  .eq('condition_id', conditionId)
  .single();
```

### Testing

**Component Testing with Storybook:**
```bash
npm run storybook
```

Create stories in `src/stories/`:
```javascript
export default {
  title: 'Components/MyComponent',
  component: MyComponent,
};

export const Default = {
  args: {
    // props
  },
};
```

**E2E Testing with Cypress:**
```bash
npx cypress open
```

### Debugging

**Enable Debug Mode:**
```env
NEXT_PUBLIC_DEBUG_MODE=true
```

**Console Logging:**
The codebase includes extensive console logging for:
- Transaction steps
- Balance updates
- Error conditions
- State changes

**Browser DevTools:**
- Use React DevTools for component inspection
- MetaMask console for transaction details
- Network tab for RPC calls

---

## Deployment

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Environment Configuration

Production environment variables:
```env
NEXT_PUBLIC_GNOSIS_RPC_URL=https://rpc.gnosischain.com
NEXT_PUBLIC_API_URL=https://api.futarchy.fi
NEXT_PUBLIC_SUPABASE_URL=production_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=production_key
NEXT_PUBLIC_DEBUG_MODE=false
```

### Deployment Platforms

**Vercel (Recommended):**
1. Connect GitHub repository
2. Configure environment variables
3. Deploy automatically on push to main

**Self-Hosted:**
```bash
# Build
npm run build

# Start with PM2
pm2 start npm --name "futarchy-web" -- start

# Or with Docker
docker build -t futarchy-web .
docker run -p 3000:3000 futarchy-web
```

### Performance Optimization

- Enable Next.js image optimization
- Configure proper caching headers
- Use CDN for static assets
- Implement code splitting
- Optimize bundle size

---

## API Reference

### useFutarchy Hook

Main hook for futarchy operations. See README.md for complete documentation.

**Key Methods:**

```javascript
const {
  // State
  balances,
  loading,
  error,
  status,

  // Actions
  addCollateral,
  removeCollateral,
  smartSwap,
  closePositions,

  // Utilities
  getPosition,
  getTotalAvailableBalance,
  updateBalances,
  canCloseCurrency
} = useFutarchy();
```

### Smart Contract ABIs

Located in `/abis/` directory:
- `FutarchyRouter.json` - Position management
- `SushiSwapRouter.json` - DEX swaps
- `ERC20.json` - Token operations
- `ConditionalTokens.json` - Conditional token system

### API Endpoints

**Supabase REST API:**
```
https://[project].supabase.co/rest/v1/
```

**Custom Backend (if configured):**
```
https://api.tickspread.com/v1/
```

---

## Troubleshooting

### Common Issues

**1. Transaction Failures**

*Problem:* Transaction reverts or fails
*Solutions:*
- Check wallet has sufficient gas (xDAI on Gnosis)
- Verify token approvals are complete
- Ensure sufficient balance of tokens
- Try increasing slippage tolerance

**2. Wallet Connection Issues**

*Problem:* Cannot connect MetaMask or wallet
*Solutions:*
- Add Gnosis Chain to MetaMask:
  - Network Name: Gnosis
  - RPC URL: https://rpc.gnosischain.com
  - Chain ID: 100
  - Currency Symbol: xDAI
  - Block Explorer: https://gnosisscan.io
- Clear browser cache
- Try different wallet provider

**3. Balance Not Updating**

*Problem:* Balances show incorrect amounts
*Solutions:*
```javascript
await updateBalances()  // Manual refresh
```
- Check RPC connection
- Wait for block confirmation
- Refresh page

**4. Approval Stuck**

*Problem:* Token approval not completing
*Solutions:*
- Check MetaMask for pending transaction
- Increase gas price
- Cancel and retry transaction
- Reset allowance to 0 first, then approve

**5. Pool Creation Fails**

*Problem:* Automated pool setup fails
*Solutions:*
- Verify config file format
- Check token addresses are correct
- Ensure sufficient token balance
- Try manual mode: `npm run interactive`

### Getting Help

**Documentation:**
- README.md - Futarchy system overview
- CLAUDE.md - Development guidelines
- Individual component documentation

**Logs:**
- Browser console for frontend errors
- MetaMask activity for transaction details
- Server logs for API issues

**Support Channels:**
- GitHub Issues
- Discord community
- Documentation wiki

### Known Limitations

1. **SushiSwap V3 Pools:** Limited to configured pool addresses
2. **Token Approvals:** Requires user confirmation for each new token
3. **Gas Estimation:** May fail for complex multi-step operations
4. **Mobile Support:** Limited mobile wallet support

---

## Additional Resources

### Documentation Files

- `README.md` - Main documentation
- `CLAUDE.md` - AI assistant guidelines
- `LIQUIDITY_DOCUMENTATION.md` - Pool management guide
- `API_TOKEN_MAPPING_GUIDE.md` - Token configuration
- `SWAP_COMPARISON.md` - DEX comparison
- Various swap architecture docs

### External Links

- [Gnosis Chain](https://www.gnosis.io/)
- [Reality.io](https://reality.eth.link/)
- [Snapshot](https://snapshot.org/)
- [SushiSwap](https://www.sushi.com/)
- [Supabase](https://supabase.com/)

### Smart Contract Addresses (Gnosis Chain)

See `src/futarchyJS/futarchyConfig.js` and `src/components/refactor/constants/addresses.js` for complete list.

---

## License

MIT License - See LICENSE file for details

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Workflow

1. Pick an issue or create one
2. Discuss approach in issue comments
3. Implement changes following code style
4. Test thoroughly (manual + Storybook)
5. Submit PR with clear description
6. Address review feedback
7. Merge after approval

---

**Last Updated:** November 26, 2025
**Version:** 0.1.0
**Maintainers:** Futarchy.fi Team
