# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, served equally (decided 2026-10-23):

- **The askers**: a DAO and the people who decide for it (voters, delegates, the team that wrote the
  proposal). They want to know what the market expects the proposal to do to the DAO's token, whether
  the proposal is passing the futarchy test, and when that becomes final, without first becoming
  traders.
- **Traders and liquidity providers**, who supply that information by taking positions in the
  conditional pools, splitting and merging collateral, and redeeming after resolution.

Market creation (`/markets/new`) and the operations page (`/ops`) are tools for the Seer team, public
for convenience; they are not part of the askers' product.

## Product Purpose

Futarchy puts a DAO's proposal in front of a market before it is final. One proposal opens two
conditional markets on the DAO's token: its price if the proposal passes and its price if it does not.
The gap between them is the market's estimate of the proposal's impact.

Success: someone arriving from a governance forum or a Snapshot vote can tell which DAO is asking,
what the market expects the proposal to do to the token, whether it is passing the test, and when the
result is final; a trader can act on it in the same page.

## Positioning

Futarchy is one application of the Seer protocol (see the ecosystem in `@seer-pm/ui-kit`'s
`seerApps`), and the only one that prices a decision as two conditional worlds rather than a set of
outcomes. Each market yields the token's price conditional on pass and on fail, not a probability
distribution. It is not a prediction market venue for betting on whether a proposal passes.

## Operating Context

- Proposals come from DAO governance: GnosisDAO GIPs (e.g. GIP-145, GIP-151, GIP-152) and Kleros DAO
  KIPs (e.g. KIP-88, KIP-90), plus milestone markets such as the ETH market on EIP-8363. They usually
  have a Snapshot vote alongside; the app links to it and shows its result.
- **The futarchy test is binding** (decided 2026-10-23): a proposal passes the test when the
  time-weighted average price (TWAP) of the pass outcome over the final window (e.g. the last 24 hours
  of the voting period) is greater than or equal to that of the fail outcome; otherwise it fails the
  test regardless of the vote. The exact window and wording come from each market's configuration
  (`MarketHero.jsx` `DEFAULT_TWAP_DESCRIPTION` and registry metadata).
- Resolution goes through Reality.eth; after resolution holders of the winning outcome redeem.
- Chains: Gnosis (Swapr/Algebra pools, collateral such as sDAI) and Ethereum mainnet (Uniswap,
  collateral such as USDS). Pool liquidity per organization is managed through the Futarchy Liquidity
  Manager (`/flm/<org>`).

## Capabilities and Constraints

- Next.js 14 pages router, static export, Netlify; see `CLAUDE.md` for the code map.
- Data: the Futarchy registry and candles GraphQL (`NEXT_PUBLIC_FUTARCHY_API_URL`), RPC reads, and
  quotes through `@seer-pm/sdk`.
- Trading logic (quotes, approvals, split/merge, redeem) is pinned by the `auto-qa` unit tests and must
  keep working through any redesign.

## Brand Commitments

- Electric Foundation through `@seer-pm/ui-kit` (tokens, Open Sans, lockup, footer, buttons, inputs,
  dialog), the same as the seer.pm landing and the Seer app. Shared values change in the kit, never
  here.
- Product name "Futarchy", shown with the Seer lockup; canonical URL futarchy.seer.pm. Never
  futarchy.fi.

## Evidence on Hand

- Live organizations and markets from the registry: Gnosis DAO, Kleros DAO, Ethereum, VeloraDAO, Aave
  DAO, with their proposals, prices, volume, TVL, trade history and resolution status.
- Absent and not to be fabricated: usage or volume totals beyond what the data shows, testimonials,
  claims that a DAO adopted a decision because of the market.

## Product Principles

1. The answer before the trade: the first thing a page says is what the market expects if the
   proposal passes versus if it does not, and where the test stands.
2. Name the asker: every proposal shows which DAO is deciding, on what, and by when.
3. Say exactly what is binding: state the test rule and its window as configured, never more or less.
4. Two worlds, one reading: pass and fail are read side by side, never as good and bad.
5. Live data only.
