/**
 * Candle window queries for the conditional-pool chart.
 *
 * A market's chart covers [start .. close]. Trading keeps going after
 * close, so asking for "the newest N candles" returns only post-close
 * candles for a closed market, which the chart then filters out — leaving
 * it blank. Instead the query is bounded by the market's own window, and
 * each pool gets its own `first:` (one alias per pool in a single request)
 * so a busy pool cannot crowd the other one out. A pool that fills its page
 * is paged backwards until the window is covered.
 *
 * Pure — no imports — so it can be unit tested directly.
 */

// The candles indexer rejects `first` above 1000.
export const CANDLE_PAGE_MAX = 1000;

// Upper bound on requests per fetch: 10 pages of 1000 hourly candles is
// over a year of history per pool.
export const CANDLE_MAX_PAGES = 10;

const toUnix = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/**
 * Resolve the [fromUnix .. toUnix] window to query.
 * - toUnix: the close timestamp, or now if the market has not closed yet
 * - fromUnix: the chart start (startCandleUnix), or 0 for full history
 */
export function resolveCandleWindow({ startUnix, closeUnix, nowUnix }) {
    const now = toUnix(nowUnix) ?? Math.floor(Date.now() / 1000);
    const close = toUnix(closeUnix);
    const to = close !== null ? Math.min(close, now) : now;
    const start = toUnix(startUnix);
    const from = start !== null && start <= to ? start : 0;
    return { fromUnix: from, toUnix: to };
}

export function clampPageSize(limit) {
    const n = Math.floor(Number(limit));
    if (!Number.isFinite(n) || n <= 0) return CANDLE_PAGE_MAX;
    return Math.min(n, CANDLE_PAGE_MAX);
}

/**
 * Build one request with an alias per pool. Each entry is
 * `{ alias, id, toUnix }`; `toUnix` is per pool because pools page
 * independently.
 *
 * The pool ID is inlined as a string literal so the /candles/graphql proxy
 * can chain-prefix it (it does not rewrite variables).
 */
export function buildWindowedCandlesQuery(pools, { fromUnix, pageSize, period = 3600 }) {
    const fields = pools.map(({ alias, id, toUnix: to }) => `
      ${alias}: candles(
        first: ${pageSize},
        orderBy: periodStartUnix,
        orderDirection: desc,
        where: { pool: "${id}", period: ${period}, periodStartUnix_gte: ${fromUnix}, periodStartUnix_lte: ${to} }
      ) {
        periodStartUnix
        period
        open
        high
        low
        close
      }`).join('');
    return `{${fields}
    }`;
}

/**
 * Pools that filled their page still have older candles in the window;
 * return them with the upper bound moved below the oldest candle seen.
 */
export function nextCandlePages(pools, data, { fromUnix, pageSize }) {
    const next = [];
    for (const pool of pools) {
        const rows = data?.[pool.alias] || [];
        if (rows.length < pageSize) continue;
        const oldest = Math.min(...rows.map(r => Number(r.periodStartUnix)));
        if (!Number.isFinite(oldest) || oldest - 1 < fromUnix) continue;
        next.push({ ...pool, toUnix: oldest - 1 });
    }
    return next;
}

/**
 * Fetch every candle in the window for each pool.
 *
 * @param {(query: string) => Promise<Object>} execute  runs a query, returns `data`
 * @param {Array<{alias: string, id: string}>} pools
 * @param {{ fromUnix: number, toUnix: number }} range
 * @param {{ pageSize?: number, maxPages?: number }} [options]
 * @returns {Promise<Object<string, Array>>} candles keyed by alias
 */
export async function fetchCandlesInWindow(execute, pools, range, options = {}) {
    const pageSize = clampPageSize(options.pageSize);
    const maxPages = options.maxPages ?? CANDLE_MAX_PAGES;
    const byAlias = Object.fromEntries(pools.map(p => [p.alias, []]));

    let pending = pools.map(p => ({ ...p, toUnix: range.toUnix }));
    for (let page = 0; page < maxPages && pending.length > 0; page++) {
        const data = await execute(
            buildWindowedCandlesQuery(pending, { fromUnix: range.fromUnix, pageSize })
        );
        for (const pool of pending) {
            byAlias[pool.alias].push(...(data?.[pool.alias] || []));
        }
        pending = nextCandlePages(pending, data, { fromUnix: range.fromUnix, pageSize });
    }
    return byAlias;
}
