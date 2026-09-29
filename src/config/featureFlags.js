/**
 * Feature Flags
 *
 * The migration flags remain enabled. Data-source diagnostics are opt-in.
 */

export const ENABLE_SUBGRAPH_FOR_ALL_PROPOSALS = true;
export const ENABLE_V2_SUBGRAPH = true;
export const USE_QUERY_PARAM_URLS = false;
export const SHOW_DATA_DEBUG = process.env.NEXT_PUBLIC_SHOW_DATA_DEBUG === 'true';
