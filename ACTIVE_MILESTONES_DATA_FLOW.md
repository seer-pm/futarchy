# Active Milestones Data Flow

## Overview
This document explains how the "Active Milestones" section on the homepage fetches, transforms, and displays market event data from Supabase.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CompaniesPage.jsx                                 │
│                     (Homepage / /companies)                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ useEffect on mount
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│              EventsHighlightDataTransformer.jsx                          │
│                  fetchEventHighlightData("all")                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
        ┌───────────────────┐         ┌────────────────────┐
        │ getAvailableCompanies()│         │                    │
        │   Returns: [9, 10, 11]│         │                    │
        └───────────────────┘         └────────────────────┘
                    │
                    │ For each company ID
                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│           ProposalsPageDataTransformer.jsx                               │
│              fetchCompanyData(companyId, false)                          │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Supabase Query:                                                │    │
│  │    supabase.from('market_event')                               │    │
│  │            .select('*')                                        │    │
│  │            .eq('company_id', companyId)                        │    │
│  │            .order('created_at', {ascending: false})            │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Returns raw market_event records from Supabase                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Transform data
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                transformCompanyData()                                    │
│                                                                          │
│  Maps Supabase fields → Proposal format:                                │
│  • id → proposalID                                                       │
│  • title → proposalTitle                                                │
│  • approval_status → approvalStatus                                     │
│  • created_at → timestamp                                               │
│  • end_date → endTime                                                   │
│  • metadata.prediction_pools → predictionPools                          │
│  • metadata.conditional_pools → poolAddresses                           │
│  • pool_yes, pool_no → fallback pool addresses                          │
│                                                                          │
│  Calculates:                                                             │
│  • impact = ((yesPriceNum - noPriceNum) / maxPrice) * 100              │
│  • eventProbability = (yesPriceNum / (yesPriceNum + noPriceNum)) * 100 │
│                                                                          │
│  Optional: Fetches live prices from blockchain if useNewPrices=true     │
│  • SDAI rate from contract                                              │
│  • Pool prices via Uniswap V3 / Algebra                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Return to EventsHighlightDataTransformer
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│        EventsHighlightDataTransformer (continued)                        │
│                                                                          │
│  For each company's proposals:                                           │
│  1. Filter active milestones:                                            │
│     • approvalStatus === "ongoing" OR "on_going" OR "pending_review"   │
│     • resolution_status !== "resolved"                                  │
│                                                                          │
│  2. Transform to eventHighlight format via createEventHighlight()       │
│                                                                          │
│  3. Combine all companies' events                                        │
│  4. Sort by startTime (most recent first)                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Return array of event highlights
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                 EventsHighlightCarousel.jsx                              │
│                                                                          │
│  1. Receives events array                                                │
│  2. Filters out "pending_review" (unless debugMode=true)                │
│  3. Maps to Swiper slides                                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ For each event
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    EventHighlightCard.jsx                                │
│                                                                          │
│  Receives props:                                                         │
│  • eventId                                                               │
│  • companyLogo                                                           │
│  • proposalTitle                                                         │
│  • initialStats {yesPrice, noPrice}                                     │
│  • predictionPools {yes: {address, tokenBaseSlot}, no: {...}}          │
│  • poolAddresses {yes, no}                                              │
│  • startTime, endTime, timeProgress                                     │
│  • status, resolutionStatus                                             │
│  • metadata (full metadata from Supabase)                               │
│                                                                          │
│  Card responsibilities:                                                  │
│  • Display initial data                                                  │
│  • Fetch live prices from pools (using predictionPools)                │
│  • Update countdown timer                                               │
│  • Recalculate impact/probability with live data                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Detailed Flow Steps

### Step 1: Component Mount
**File:** `src/components/futarchyFi/companyList/page/CompaniesPage.jsx`

```javascript
useEffect(() => {
  const loadEventHighlights = async () => {
    await fetchEventHighlightData("all");
    setIsEventsCarouselLoading(false);
  };
  loadEventHighlights();
}, []);
```

### Step 2: Fetch All Companies
**File:** `src/components/futarchyFi/companyList/page/EventsHighlightDataTransformer.jsx`

```javascript
// When companyId === "all"
const { getAvailableCompanies } = await import("...");
const availableCompanyIds = await getAvailableCompanies();
// Returns: [9, 10, 11] (Gnosis, Kleros, Tesla)
```

**Supabase Query:**
```javascript
supabase
  .from('market_event')
  .select('company_id')
  .order('company_id')
// Returns distinct company_id values
```

### Step 3: Fetch Each Company's Data
**File:** `src/components/futarchyFi/proposalsList/page/proposalsPage/ProposalsPageDataTransformer.jsx`

For each company ID, fetch all market events:

```javascript
const { data, error } = await supabase
  .from('market_event')
  .select('*')
  .eq('company_id', effectiveCompanyId)
  .order('created_at', { ascending: false });
```

**Supabase Table Schema (`market_event`):**
```javascript
{
  id: number,
  company_id: number,
  title: string,
  approval_status: "ongoing" | "on_going" | "pending_review" | "approved" | "refused",
  resolution_status: "unresolved" | "resolved",
  created_at: ISO timestamp,
  end_date: ISO timestamp,
  pool_yes: address,
  pool_no: address,
  condition_id: string,
  question_id: string,
  tokens: object,
  metadata: {
    prediction_pools: {
      yes: { address, tokenBaseSlot },
      no: { address, tokenBaseSlot }
    },
    conditional_pools: {
      yes: { address, tokenCompanySlot },
      no: { address, tokenCompanySlot }
    },
    token_images: {
      company: url,
      currency: url
    }
  },
  proposal_markdown: string,
  tags: string[]
}
```

### Step 4: Transform Supabase Data
**File:** `src/components/futarchyFi/proposalsList/page/proposalsPage/ProposalsPageDataTransformer.jsx`

```javascript
const companyData = {
  company_id: effectiveCompanyId,
  name: "Gnosis DAO", // Hardcoded based on ID
  logo: "/assets/gnosis-dao-logo.png",
  currency_token: "GNO",
  proposals: data.map(event => ({
    proposal_id: event.id,
    proposal_title: event.title,
    approval_status: event.approval_status,
    timestamp: convertToTimestamp(event.created_at),
    end_time: convertToTimestamp(event.end_date),
    prices: {
      approval: `${event.approval_price} SDAI`,
      refusal: `${event.refusal_price} SDAI`
    },
    metadata: event.metadata,
    pool_yes: event.pool_yes,
    pool_no: event.pool_no,
    predictionPools: event.metadata?.prediction_pools
  }))
};
```

Then calls `transformCompanyData()` which:

1. **Parses timestamps:**
   ```javascript
   endTimeDate = new Date(proposal.end_date);
   timestamp = new Date(proposal.created_at);
   ```

2. **Extracts pool configurations:**
   ```javascript
   predictionPools = {
     yes: {
       address: metadata.prediction_pools.yes.address,
       tokenBaseSlot: metadata.prediction_pools.yes.token_slot
     },
     no: { /* same structure */ }
   };

   poolAddresses = {
     yes: metadata.conditional_pools?.yes?.address || pool_yes,
     no: metadata.conditional_pools?.no?.address || pool_no
   };
   ```

3. **Fetches live prices (if useNewPrices=true):**
   ```javascript
   // Fetch SDAI rate
   const sdaiRate = await fetchSdaiRate(provider);

   // Fetch pool prices via Uniswap V3
   const v3Yes = await fetchUniswapV3Price(
     predictionPools.yes.address,
     predictionPools.yes.tokenBaseSlot,
     provider
   );
   ```

4. **Calculates metrics:**
   ```javascript
   // Impact
   const maxPrice = Math.max(yesPriceNum, noPriceNum);
   impact = ((yesPriceNum - noPriceNum) / maxPrice) * 100;

   // Event probability
   eventProbability = (yesPriceNum / (yesPriceNum + noPriceNum)) * 100;
   ```

### Step 5: Filter Active Milestones
**File:** `src/components/futarchyFi/companyList/page/EventsHighlightDataTransformer.jsx`

```javascript
const activeProposals = companyData.proposals.filter(p =>
  (p.approvalStatus === "ongoing" ||
   p.approvalStatus === "on_going" ||
   p.approvalStatus === "pending_review") &&
  p.resolution_status !== "resolved"
);
```

### Step 6: Transform to Event Highlights
**File:** `src/components/futarchyFi/companyList/page/EventsHighlightDataTransformer.jsx`

```javascript
const eventData = {
  eventId: proposal.proposalID,
  eventTitle: proposal.proposalTitle,
  companyLogo: companyData.logo,
  authorName: companyData.name,
  stats: {
    yesPrice: proposal.prices?.approval,
    noPrice: proposal.prices?.refusal
  },
  predictionPools: proposal.predictionPools,
  poolAddresses: {
    yes: proposal.metadata?.conditional_pools?.yes?.address || proposal.pool_yes,
    no: proposal.metadata?.conditional_pools?.no?.address || proposal.pool_no
  },
  startTime: proposal.timestamp,
  endTime: proposal.endTime,
  timeProgress: calculateTimeProgress(proposal.timestamp, proposal.endTime),
  status: proposal.approvalStatus,
  resolutionStatus: proposal.resolution_status,
  metadata: proposal.metadata,
  companyId: companyId
};
```

### Step 7: Render Carousel
**File:** `src/components/futarchyFi/companyList/components/EventsHighlightCarousel.jsx`

```javascript
// Filter out pending_review unless debug mode
const newFilteredEvents = debugMode
  ? events
  : events.filter(event => event.status !== 'pending_review');

// Map to Swiper slides
{filteredEvents.map((event, index) => (
  <SwiperSlide key={index}>
    <EventHighlightCard
      eventId={event.eventId}
      companyLogo={event.companyLogo}
      proposalTitle={event.eventTitle}
      initialStats={event.stats}
      predictionPools={event.predictionPools}
      poolAddresses={event.poolAddresses}
      startTime={event.startTime}
      endTime={event.endTime}
      timeProgress={event.timeProgress}
      status={event.status}
      metadata={event.metadata}
    />
  </SwiperSlide>
))}
```

### Step 8: Card Display & Live Updates
**File:** `src/components/futarchyFi/companyList/cards/highlightCards/EventHighlightCard.jsx`

The card receives the data and:

1. **Displays initial data** from props
2. **Fetches live prices** from blockchain using `predictionPools`
3. **Updates countdown** timer using `startTime` and `endTime`
4. **Recalculates metrics** (impact, probability) with live prices
5. **Shows status** based on `status` and `resolutionStatus`

## Key Data Sources

### Pool Addresses
Cards receive pool data from multiple sources with fallback priority:

1. **`predictionPools`** - Used for live price fetching
   - Source: `metadata.prediction_pools`
   - Contains: `{yes: {address, tokenBaseSlot}, no: {...}}`

2. **`poolAddresses`** - Alternative pool addresses
   - Source: `metadata.conditional_pools` → fallback to `pool_yes`/`pool_no`
   - Contains: `{yes: address, no: address}`

### Price Data Flow
1. **Initial/Static prices:** From Supabase `approval_price` and `refusal_price`
2. **Transformer prices:** Optionally fetched during transformation if `useNewPrices=true`
3. **Card prices:** Fetched live by the card component using Algebra/Uniswap V3 pools

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `NEXT_PUBLIC_DEBUG_MODE` - Use mock data instead of Supabase
- `NEXT_PUBLIC_USE_DEFAULT_MOCK_METADATA` - Use default pool metadata when missing
- `NEXT_PUBLIC_ALLOW_MOCK_FALLBACK` - Fall back to mock data on errors
- `NEXT_PUBLIC_GNOSIS_RPC_URL` - RPC endpoint for blockchain queries

## Performance Considerations

1. **Parallel fetching:** All companies fetched in parallel using `Promise.all()`
2. **Price fetching strategy:**
   - Transformer: `useNewPrices=false` to skip expensive blockchain calls
   - Card: Fetches own prices asynchronously after render
3. **Caching:** No caching currently implemented
4. **Supabase query:** Single query per company, ordered by `created_at`

## Error Handling

1. **Supabase errors:** Falls back to mock data if `NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true`
2. **Price fetch errors:** Card continues with initial/static prices
3. **Missing metadata:** Uses fallback pool addresses from root fields (`pool_yes`, `pool_no`)
4. **Invalid timestamps:** Regex parsing from proposal title as fallback
