/**
 * GeckoTerminal search-result matching, kept free of imports so it can be
 * unit tested with node:test.
 */

/**
 * Pick the pool for base/quote from a GeckoTerminal search response
 * (requested with include=base_token,quote_token). Keeps the API's ranking
 * within each orientation. Returns { pool, reversed } or null.
 */
export function pickSearchPool(data, base, quote) {
    const pools = data?.data || [];
    const symbols = new Map(
        (data?.included || []).map(t => [t.id, String(t.attributes?.symbol || '').toLowerCase()])
    );
    const b = String(base).toLowerCase();
    const q = String(quote).toLowerCase();
    const sidesOf = (p) => [
        symbols.get(p.relationships?.base_token?.data?.id),
        symbols.get(p.relationships?.quote_token?.data?.id),
    ];

    const direct = pools.find(p => {
        const [pb, pq] = sidesOf(p);
        return pb === b && pq === q;
    });
    if (direct) return { pool: direct, reversed: false };

    const reversed = pools.find(p => {
        const [pb, pq] = sidesOf(p);
        return pb === q && pq === b;
    });
    if (reversed) return { pool: reversed, reversed: true };

    return null;
}
