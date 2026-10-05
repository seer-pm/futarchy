# Companies Page Data Flow - Complete Understanding

> **Summary:** How `/companies` page works, how company cards are created, and what metadata is required to display them.

---

## 📊 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              /companies Page                                  │
│                         (CompaniesPage.jsx)                                  │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CompaniesListCarousel.jsx                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Data Sources (picks one based on URL params)                           │ │
│  │                                                                          │ │
│  │  1. SUBGRAPH (if ?useAggregator=0x... in URL)                           │ │
│  │     → useAggregatorCompanies(aggregatorAddress) hook                    │ │
│  │     → Queries futarchy-complete subgraph                                │ │
│  │                                                                          │ │
│  │  2. SUPABASE (default)                                                  │ │
│  │     → fetchAndTransformCompanies()                                       │ │
│  │     → Reads from `company` table                                        │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           CompaniesCard.jsx                                  │
│  Props: name, stats, image, colors, companyID, fromSubgraph, owner           │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow: Two Paths

### Path 1: Supabase (Default - Production)

```
User visits /companies
       │
       ▼
CompaniesPage.jsx
       │
       ▼
CompaniesListCarousel.jsx
       │
       ├─→ fetchAndTransformCompanies()  (CompaniesDataTransformer.jsx)
       │         │
       │         ▼
       │    Supabase `company` table
       │         │
       │         ▼
       │    Filter: status === 'public' && active proposals > 0
       │
       ▼
CompaniesCard.jsx (for each company)
```

**Supabase `company` Table Schema:**
```
┌─────────────────────────────────────────────────────────────────┐
│ id  │ name       │ logo           │ status  │ metadata (JSON)  │
├─────────────────────────────────────────────────────────────────┤
│ 9   │ Gnosis DAO │ /assets/gn...  │ public  │ {background_...} │
│ 10  │ Kleros DAO │ https://...    │ public  │ {background_...} │
└─────────────────────────────────────────────────────────────────┘
```

### Path 2: Subgraph (via URL param)

```
User visits /companies?useAggregator=0xC5eB43D53e2FE5FddE5faf400CC4167e5b5d4Fc1
       │
       ▼
CompaniesPage.jsx → sets aggregatorAddress state
       │
       ▼
CompaniesListCarousel.jsx
       │
       ├─→ useAggregatorCompanies(aggregatorAddress) hook
       │         │
       │         ▼
       │    GraphQL Query to futarchy-complete subgraph:
       │    
       │    query GetAggregatorCompanies($aggregatorId: ID!) {
       │      aggregator(id: $aggregatorId) {
       │        organizations {
       │          id              ← Contract address
       │          name
       │          description
       │          metadata        ← JSON string
       │          metadataURI
       │          owner
       │          proposals { id }
       │        }
       │      }
       │    }
       │
       ├─→ transformOrgToCard(org) → parses metadata JSON
       │
       ▼
CompaniesCard.jsx (with fromSubgraph=true badge)
```

---

## 🃏 CompaniesCard Props

```javascript
<CompaniesCard
  name={company.title}                    // Display name
  stats={{ proposals: company.proposals }} // Milestone count
  image={company.image}                   // Background hero image
  colors={company.colors}                 // { primary: "#hex" }
  companyID={company.companyID}           // Numeric ID or contract address
  fromSubgraph={company.fromSubgraph}     // Shows "📊 Subgraph" badge
  owner={company.owner}                   // Shows "👑 Owner" badge if match
  connectedAddress={connectedAddress}     // Current wallet
  useStorybookUrl={false}
/>
```

---

## 📦 Metadata Format

### For Supabase (`company` table)

**Required Fields:**
```json
{
  "background_image": "/assets/company-hero.png",  // Card hero background
}
```

**Optional Fields:**
```json
{
  "background_image": "/assets/company-hero.png",
  "website": "https://example.com",
  "colors": {
    "primary": "#4F46E5"   // Used for hero container background
  }
}
```

**Example - Full Company Row:**
```sql
INSERT INTO company (id, name, logo, status, metadata) VALUES (
  9,
  'Gnosis DAO',
  '/assets/gnosis-dao-logo.png',    -- Used in milestone avatars
  'public',                          -- Must be 'public' to show
  '{
    "background_image": "/assets/gnosis-company-bg.png",
    "website": "https://gnosis.io",
    "colors": { "primary": "#4F46E5" }
  }'::jsonb
);
```

### For Subgraph (Organization.metadata field)

The `metadata` field on the `Organization` entity is a **JSON string** stored on-chain:

```json
{
  "coverImage": "https://example.com/hero.png",  // Priority 1
  "logo": "https://example.com/logo.png",        // Priority 2 (fallback)
  "colors": {
    "primary": "#6b21a8"
  },
  "website": "https://example.com",
  "twitter": "@example"
}
```

**Transformation Logic (`useAggregatorCompanies.js`):**
```javascript
function transformOrgToCard(org) {
    const meta = JSON.parse(org.metadata || '{}');
    
    return {
        companyID: org.id,                           // Contract address
        title: org.name || 'Unknown Organization',
        image: meta.coverImage || meta.logo || '/assets/fallback-company.png',
        colors: meta.colors || { primary: '#6b21a8' },
        proposals: org.proposals?.length || 0,
        fromSubgraph: true,
        owner: org.owner,
        // ...
    };
}
```

---

## 🔑 Key Points

### What Makes a Company Appear on /companies?

**For Supabase source:**
1. ✅ Exists in `company` table
2. ✅ `status = 'public'`
3. ✅ Has at least 1 active proposal (`market_event.approval_status IN ('ongoing', 'on_going')`)
4. ✅ Has `metadata.background_image` (or will show error in console)

**For Subgraph source:**
1. ✅ Organization exists under the specified Aggregator
2. ✅ Has `metadata` JSON with `coverImage` or `logo`

### Image Usage

| Location              | Field Used                        |
|-----------------------|-----------------------------------|
| Card Hero Background  | `metadata.background_image` (Supabase) or `coverImage` (Subgraph) |
| Milestone Avatars     | `company.logo` column (Supabase)  |
| Card background color | `metadata.colors.primary`         |

---

## 🧪 Testing

### Test Subgraph Data Source
```
http://localhost:3000/companies?useAggregator=0xC5eB43D53e2FE5FddE5faf400CC4167e5b5d4Fc1
```
Cards from subgraph will show **"📊 Subgraph"** badge.

### Test Supabase Data Source
```
http://localhost:3000/companies
```
Standard production mode, reads from `company` table.

### Debug Mode (shows extra buttons)
```
http://localhost:3000/companies?debugMode=true
```

---

## 📁 File Reference

| File | Purpose |
|------|---------|
| `src/components/futarchyFi/companyList/page/CompaniesPage.jsx` | Page layout, sections |
| `src/components/futarchyFi/companyList/components/CompaniesListCarousel.jsx` | Swiper carousel, merges data sources |
| `src/components/futarchyFi/companyList/page/CompaniesDataTransformer.jsx` | Supabase fetching + transformation |
| `src/hooks/useAggregatorCompanies.js` | Subgraph fetching + transformation |
| `src/components/futarchyFi/companyList/cards/deafultCards/CompaniesCard.jsx` | Card rendering |

---

## 📋 Subgraph Query Example

To get organizations for a company card from the subgraph:

```graphql
query GetAggregatorCompanies {
  aggregator(id: "0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1") {
    id
    name
    organizations {
      id
      name
      description
      metadata          # JSON string: {"coverImage": "...", "colors": {...}}
      owner
      proposals {
        id
      }
    }
  }
}
```

**Response Example:**
```json
{
  "data": {
    "aggregator": {
      "id": "0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1",
      "name": "FutarchyFi",
      "organizations": [
        {
          "id": "0x818f...",
          "name": "Gnosis",
          "description": "Gnosis DAO governance",
          "metadata": "{\"coverImage\":\"/assets/gnosis-bg.png\",\"colors\":{\"primary\":\"#4F46E5\"}}",
          "owner": "0x645a...",
          "proposals": [
            { "id": "0x3d07..." },
            { "id": "0x45e1..." }
          ]
        }
      ]
    }
  }
}
```

---

**Document Created:** 2026-01-30
**Location:** `docs/COMPANIES_PAGE_UNDERSTANDING.md`
