#!/usr/bin/env node

/**
 * SEO Generator Script (registry-fed)
 *
 * Derives the static market list from the on-chain registry (Checkpoint
 * indexer behind api.futarchy.fi) — the same data source the frontend
 * runtime uses (see src/hooks/useAggregatorProposals.js and
 * src/adapters/registryAdapter.js). The old Supabase backend
 * (market_event / ai_prompts tables) is permanently gone.
 *
 * What it writes: src/config/markets.js — the full MARKETS_CONFIG map
 * that drives `getStaticPaths` (fallback: false) in
 * src/pages/markets/[address].js. Every key becomes a canonical
 * /markets/<address> static page with OG/Twitter meta at build time.
 *
 * Content sources, in priority order:
 *   1. src/config/legacy-seo.json — checked-in snapshot of the SEO
 *      content generated in the Supabase/OpenAI era (titles,
 *      descriptions, images for the legacy markets). Preserved verbatim
 *      so existing URLs and meta don't churn.
 *   2. The registry proposal entity (displayNameQuestion/Event,
 *      description, metadata JSON) + organization metadata (logo).
 *   3. src/config/mapped-seo.json — manual per-address image overrides.
 *   4. Deterministic templates for anything still missing.
 *
 * Failure policy: any registry fetch/GraphQL error, missing aggregator,
 * empty organization list or empty proposal list exits non-zero. A build
 * must never silently ship with a shrunken market list.
 *
 * Usage:
 *   npm run generate-seo
 */

import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────
// Configuration — keep in sync with src/config/subgraphEndpoints.js
// (that file is ESM-for-Next and can't be imported from a plain Node
// script in this CJS package).
// ─────────────────────────────────────────────────────────────────────
const REGISTRY_GRAPHQL_URL =
  process.env.REGISTRY_GRAPHQL_URL || 'https://api.futarchy.fi/registry/graphql';
const DEFAULT_AGGREGATOR = '0xc5eb43d53e2fe5fdde5faf400cc4167e5b5d4fc1';
const SITE_ORIGIN = 'https://futarchy.fi';
const DEFAULT_IMAGE = '/assets/futarchy-logo-gray.png';

const LEGACY_SEO_PATH = path.join(process.cwd(), 'src', 'config', 'legacy-seo.json');
const MAPPED_SEO_PATH = path.join(process.cwd(), 'src', 'config', 'mapped-seo.json');
const OUTPUT_PATH = path.join(process.cwd(), 'src', 'config', 'markets.js');

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function fail(message, detail) {
  console.error(`❌ ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────
// Registry fetching (same flat Checkpoint queries the frontend uses)
// ─────────────────────────────────────────────────────────────────────

async function gql(query, variables) {
  let response;
  try {
    response = await fetch(REGISTRY_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e) {
    throw new Error(`Registry endpoint unreachable (${REGISTRY_GRAPHQL_URL}): ${e.message}`);
  }
  if (!response.ok) {
    throw new Error(`Registry endpoint returned HTTP ${response.status} (${REGISTRY_GRAPHQL_URL})`);
  }
  const result = await response.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(`Registry GraphQL error: ${result.errors[0]?.message || 'unknown'}`);
  }
  return result.data;
}

const AGGREGATOR_QUERY = `
  query($id: String!) {
    aggregator(id: $id) {
      id
      name
    }
  }
`;

const ORGANIZATIONS_QUERY = `
  query($aggregatorId: String!) {
    organizations(where: { aggregator: $aggregatorId }, first: 1000) {
      id
      name
      metadata
    }
  }
`;

const PROPOSALS_QUERY = `
  query($orgIds: [String!]!) {
    proposalEntities(where: { organization_in: $orgIds }, first: 1000) {
      id
      title
      description
      displayNameEvent
      displayNameQuestion
      metadata
      proposalAddress
      organization { id }
    }
  }
`;

async function fetchRegistryProposals() {
  const aggData = await gql(AGGREGATOR_QUERY, { id: DEFAULT_AGGREGATOR });
  if (!aggData?.aggregator) {
    throw new Error(`Aggregator not found in registry: ${DEFAULT_AGGREGATOR}`);
  }

  const orgData = await gql(ORGANIZATIONS_QUERY, { aggregatorId: DEFAULT_AGGREGATOR });
  const organizations = orgData?.organizations || [];
  if (organizations.length === 0) {
    throw new Error('Registry returned zero organizations for the aggregator — refusing to generate an empty market list');
  }

  const orgById = new Map(organizations.map((o) => [o.id, o]));
  const propData = await gql(PROPOSALS_QUERY, { orgIds: organizations.map((o) => o.id) });
  const proposals = propData?.proposalEntities || [];
  if (proposals.length === 0) {
    throw new Error('Registry returned zero proposals for the aggregator — refusing to generate an empty market list');
  }

  return { organizations, orgById, proposals };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function parseMetadata(metadataString) {
  if (!metadataString) return {};
  if (typeof metadataString === 'object') return metadataString;
  try {
    return JSON.parse(metadataString);
  } catch {
    return {};
  }
}

// Mirrors src/utils/proposalLifecycle.js (can't be imported from a plain
// Node script — it's ESM-for-Next inside a CJS package).
function normalizeUnixTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const parsedMs = Date.parse(String(value));
  if (Number.isFinite(parsedMs)) return Math.floor(parsedMs / 1000);
  return null;
}

function isArchived(meta) {
  return meta.archived === true || meta.archived === 'true';
}

function isHidden(meta) {
  return meta.visibility === 'hidden' || meta.visibility === 'test';
}

function isResolved(meta) {
  const outcome = meta.resolution_outcome ?? meta.finalOutcome;
  return meta.resolution_status === 'resolved' ||
    (outcome !== null && outcome !== undefined && outcome !== '');
}

function isClosed(meta, nowSeconds) {
  const close = normalizeUnixTimestamp(meta.closeTimestamp ?? meta.endTime);
  return close !== null && close <= nowSeconds;
}

function normalizeImagePath(img) {
  if (!img || typeof img !== 'string') return null;
  if (img.startsWith('/') || img.startsWith('http')) return img;
  return `/assets/${img}`;
}

function generateKeywords(title, orgName) {
  const keywords = ['futarchy', 'prediction market', 'governance', 'blockchain'];
  const haystack = `${title} ${orgName || ''}`;
  if (/\bGNO\b|Gnosis/i.test(haystack)) keywords.push('GNO', 'Gnosis', 'GnosisDAO');
  if (/\bPNK\b|Kleros/i.test(haystack)) keywords.push('PNK', 'Kleros', 'arbitration');
  if (/\bCOW\b|CoW/.test(haystack)) keywords.push('COW', 'CoW DAO');
  if (/\bAAVE\b|Aave/i.test(haystack)) keywords.push('AAVE', 'Aave');
  if (/\bsDAI\b/i.test(haystack)) keywords.push('sDAI', 'savings', 'DeFi');
  if (orgName) keywords.push(orgName);
  return [...new Set(keywords)];
}

function getMarketCategory(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('price') || t.includes('trading') || t.includes('volume')) return 'trading';
  if (t.includes('defi') || t.includes('tvl') || t.includes('yield')) return 'defi';
  if (t.includes('kleros') || t.includes('kip-')) return 'arbitration';
  return 'governance';
}

function truncate(text, max) {
  if (!text || text.length <= max) return text;
  return `${text.substring(0, max - 3)}...`;
}

// ─────────────────────────────────────────────────────────────────────
// Entry construction
// ─────────────────────────────────────────────────────────────────────

function buildRegistryEntry({ addressKey, entity, org, mappedSeoByAddress, nowSeconds }) {
  const meta = parseMetadata(entity.metadata);
  const orgMeta = parseMetadata(org?.metadata);

  const question = entity.displayNameQuestion || '';
  const event = entity.displayNameEvent || '';
  const combined = (question === event ? question : `${question} ${event}`).trim();

  const title =
    meta.seo?.title ||
    combined ||
    entity.title ||
    'Futarchy Market Prediction';

  const description =
    meta.seo?.description ||
    entity.description ||
    meta.description ||
    truncate(
      `Live futarchy prediction market${org?.name ? ` by ${org.name}` : ''}: ${title} Trade your insights or follow the forecast at futarchy.fi!`,
      160
    );

  const image =
    mappedSeoByAddress.get(addressKey.toLowerCase()) ||
    normalizeImagePath(meta.seo?.image) ||
    normalizeImagePath(orgMeta.coverImage) ||
    normalizeImagePath(orgMeta.logo) ||
    DEFAULT_IMAGE;

  const isActive =
    !isArchived(meta) &&
    !isHidden(meta) &&
    !isResolved(meta) &&
    !isClosed(meta, nowSeconds);

  const pagePath = `/markets/${addressKey}`;
  const keywords = generateKeywords(`${title} ${entity.description || ''}`, org?.name);
  const category = getMarketCategory(title);
  const closeTimestamp = normalizeUnixTimestamp(meta.closeTimestamp ?? meta.endTime);

  return {
    title,
    description,
    image,
    path: pagePath,
    openGraph: {
      title: `${title} | Futarchy.fi`,
      description,
      image: image.startsWith('http') ? image : `${SITE_ORIGIN}${image}`,
      type: 'website',
      siteName: 'Futarchy.fi',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Futarchy.fi`,
      description,
      image: image.startsWith('http') ? image : `${SITE_ORIGIN}${image}`,
    },
    keywords,
    category,
    isActive,
    metadata: {
      source: 'registry',
      organization: org?.name || null,
      organizationId: org?.id || null,
      chainId: meta.chain ? parseInt(meta.chain, 10) : (orgMeta.chain ? parseInt(orgMeta.chain, 10) : 100),
      resolutionStatus: meta.resolution_status || null,
      resolutionOutcome: meta.resolution_outcome || null,
      visibility: meta.visibility || 'public',
      closeTimestamp,
    },
  };
}

/**
 * Dedupe registry proposal entities by proposalAddress.
 * Multiple metadata entities can point at the same trading contract
 * (re-submissions); prefer the non-archived one, then the one with SEO
 * metadata, then the lexicographically smallest entity id (deterministic).
 */
function dedupeByAddress(proposals, orgById) {
  const byAddress = new Map();
  for (const entity of proposals) {
    const address = entity.proposalAddress;
    if (!address || !ADDRESS_RE.test(address)) continue;
    const key = address.toLowerCase();
    if (!byAddress.has(key)) byAddress.set(key, []);
    byAddress.get(key).push(entity);
  }

  const winners = new Map();
  for (const [key, candidates] of byAddress) {
    candidates.sort((a, b) => {
      const aMeta = parseMetadata(a.metadata);
      const bMeta = parseMetadata(b.metadata);
      const archivedDiff = Number(isArchived(aMeta)) - Number(isArchived(bMeta));
      if (archivedDiff !== 0) return archivedDiff;
      const seoDiff = Number(!!bMeta.seo) - Number(!!aMeta.seo);
      if (seoDiff !== 0) return seoDiff;
      return String(a.id).localeCompare(String(b.id));
    });
    const winner = candidates[0];
    winners.set(key, { entity: winner, org: orgById.get(winner.organization?.id) || null });
  }
  return winners;
}

// ─────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────

function renderMarketsFile(marketsConfig) {
  const activeCount = Object.values(marketsConfig).filter((c) => c.isActive).length;

  return `/**
 * Markets configuration with SEO metadata for each market address
 * This file is auto-generated by scripts/generate-seo.mjs — do not edit
 * by hand. The market list comes from the on-chain registry
 * (${REGISTRY_GRAPHQL_URL}, aggregator ${DEFAULT_AGGREGATOR});
 * legacy Supabase-era SEO content is preserved via
 * src/config/legacy-seo.json.
 *
 * Total markets: ${Object.keys(marketsConfig).length}
 * Active markets: ${activeCount}
 */

export const MARKETS_CONFIG = ${JSON.stringify(marketsConfig, null, 2)};

/**
 * Get all market addresses that should be statically generated
 */
export function getStaticMarketAddresses() {
  return Object.keys(MARKETS_CONFIG);
}

/**
 * Get market configuration by address
 */
export function getMarketConfig(address) {
  return MARKETS_CONFIG[address] || null;
}

/**
 * Get all active market configurations
 */
export function getAllActiveMarkets() {
  return Object.entries(MARKETS_CONFIG)
    .filter(([_, config]) => config.isActive)
    .map(([address, config]) => ({ address, ...config }));
}

/**
 * Generate dynamic SEO metadata for a market
 */
export function generateMarketSEO(address, marketData = null) {
  const config = getMarketConfig(address);
  if (!config) return null;

  // Allow dynamic override from marketData if available
  const title = marketData?.seoTitle || config.title;
  const description = marketData?.seoDescription || config.description;
  const image = marketData?.seoImage || config.image;

  return {
    title: \`\${title} | Futarchy.fi\`,
    description,
    image,
    url: \`${SITE_ORIGIN}\${config.path}\`,
    openGraph: {
      ...config.openGraph,
      title: marketData?.seoTitle ? \`\${marketData.seoTitle} | Futarchy.fi\` : config.openGraph.title,
      description: marketData?.seoDescription || config.openGraph.description,
      image: marketData?.seoImage || config.openGraph.image,
      url: \`${SITE_ORIGIN}\${config.path}\`
    },
    twitter: {
      ...config.twitter,
      title: marketData?.seoTitle ? \`\${marketData.seoTitle} | Futarchy.fi\` : config.twitter.title,
      description: marketData?.seoDescription || config.twitter.description,
      image: marketData?.seoImage || config.twitter.image
    }
  };
}
`;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 SEO generation from on-chain registry');
  console.log(`   Endpoint:   ${REGISTRY_GRAPHQL_URL}`);
  console.log(`   Aggregator: ${DEFAULT_AGGREGATOR}`);

  // 1. Legacy snapshot (required — protects the historical URLs/content)
  let legacySeo;
  try {
    legacySeo = JSON.parse(fs.readFileSync(LEGACY_SEO_PATH, 'utf8'));
  } catch (e) {
    return fail(`Cannot read legacy SEO snapshot at ${LEGACY_SEO_PATH}`, e.message);
  }
  const legacyKeys = Object.keys(legacySeo);
  console.log(`📦 Legacy snapshot: ${legacyKeys.length} markets`);

  // 2. Manual image overrides (optional)
  let mappedSeo = {};
  if (fs.existsSync(MAPPED_SEO_PATH)) {
    try {
      mappedSeo = JSON.parse(fs.readFileSync(MAPPED_SEO_PATH, 'utf8'));
    } catch (e) {
      return fail(`Invalid JSON in ${MAPPED_SEO_PATH}`, e.message);
    }
  }
  const mappedSeoByAddress = new Map(
    Object.entries(mappedSeo).map(([addr, img]) => [
      addr.toLowerCase(),
      typeof img === 'string' ? img : img?.image || null,
    ])
  );

  // 3. Registry fetch — any failure here aborts the build (non-zero exit)
  let registry;
  try {
    registry = await fetchRegistryProposals();
  } catch (e) {
    return fail('Registry fetch failed — aborting so the build cannot ship a stale/empty market list', e.message);
  }
  console.log(`🔗 Registry: ${registry.organizations.length} organizations, ${registry.proposals.length} proposal entities`);

  const registryByAddress = dedupeByAddress(registry.proposals, registry.orgById);
  console.log(`🔗 Registry: ${registryByAddress.size} unique market addresses`);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const marketsConfig = {};
  let preservedCount = 0;
  let refreshedCount = 0;
  let newCount = 0;
  let skippedCount = 0;

  // 4. Legacy markets first (original order → stable URLs, minimal diffs).
  //    Content (title/description/image/meta tags) is preserved verbatim;
  //    lifecycle status is refreshed from the registry when the market is
  //    still listed there.
  for (const key of legacyKeys) {
    const entry = { ...legacySeo[key] };
    const registryMatch = registryByAddress.get(key.toLowerCase());
    if (registryMatch) {
      const meta = parseMetadata(registryMatch.entity.metadata);
      entry.isActive =
        !isArchived(meta) &&
        !isHidden(meta) &&
        !isResolved(meta) &&
        !isClosed(meta, nowSeconds);
      entry.metadata = {
        ...entry.metadata,
        source: 'legacy+registry',
        resolutionStatus: meta.resolution_status || entry.metadata?.resolutionStatus || null,
        resolutionOutcome: meta.resolution_outcome || null,
        visibility: meta.visibility || entry.metadata?.visibility || 'public',
      };
      refreshedCount++;
    } else {
      // No longer (or never) in the registry: keep the page, mark inactive.
      entry.isActive = false;
      entry.metadata = { ...entry.metadata, source: 'legacy' };
      preservedCount++;
    }
    marketsConfig[key] = entry;
  }

  // 5. New registry markets (not in the legacy snapshot), sorted by
  //    address for deterministic output. Keys use the address exactly as
  //    the registry returns it — the same value the frontend uses to
  //    build /markets/<address> links.
  const legacyKeySet = new Set(legacyKeys.map((k) => k.toLowerCase()));
  const newAddresses = [...registryByAddress.keys()]
    .filter((addr) => !legacyKeySet.has(addr))
    .sort();

  for (const addr of newAddresses) {
    const { entity, org } = registryByAddress.get(addr);
    const meta = parseMetadata(entity.metadata);

    // Skip test/staging entries — mirrors the frontend list behaviour
    // (archived proposals are filtered in fetchProposalsFromAggregator;
    // hidden ones are owner-only). They'll be picked up automatically on
    // the next build once they go public.
    if (isArchived(meta) || isHidden(meta)) {
      skippedCount++;
      continue;
    }

    const addressKey = entity.proposalAddress;
    marketsConfig[addressKey] = buildRegistryEntry({
      addressKey,
      entity,
      org,
      mappedSeoByAddress,
      nowSeconds,
    });
    newCount++;
  }

  // 6. Safety rails: never write fewer pages than the legacy snapshot.
  const total = Object.keys(marketsConfig).length;
  if (total < legacyKeys.length) {
    return fail(`Generated market list (${total}) is smaller than the legacy snapshot (${legacyKeys.length}) — refusing to write`);
  }

  fs.writeFileSync(OUTPUT_PATH, renderMarketsFile(marketsConfig), 'utf8');

  console.log('\n📈 SEO Generation Summary:');
  console.log(`   Total market pages:            ${total}`);
  console.log(`   Legacy, refreshed by registry: ${refreshedCount}`);
  console.log(`   Legacy, registry-absent:       ${preservedCount}`);
  console.log(`   New from registry:             ${newCount}`);
  console.log(`   Skipped (archived/hidden):     ${skippedCount}`);
  console.log(`\n💾 Wrote ${OUTPUT_PATH}`);

  const newOnes = newAddresses.filter((a) => !legacyKeySet.has(a));
  if (newCount > 0) {
    console.log('\n🆕 New market pages:');
    for (const addr of newOnes) {
      const key = registryByAddress.get(addr)?.entity?.proposalAddress;
      if (marketsConfig[key]) {
        console.log(`   • /markets/${key} — "${marketsConfig[key].title}"`);
      }
    }
  }
  console.log('\n🎉 SEO generation completed successfully!');
}

main().catch((e) => fail('Unexpected error during SEO generation', e.stack || e.message));
