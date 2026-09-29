/**
 * GraphQL Response
 *
 * Turns a fetch() Response from one of the futarchy GraphQL endpoints into
 * its `data`, or throws.
 *
 * An outage used to look like an empty result: a 502 whose body carries
 * `{ errors: [...] }` was read as "no pools", "no prices" or "no
 * organizations", cached as a success, and rendered as zeros. Throwing
 * instead lets requestCache skip caching it and lets the UI say the data is
 * unavailable.
 *
 * No imports, so node:test can load this module directly.
 */

export class GraphqlRequestError extends Error {
    constructor(message, { status = null, errors = null } = {}) {
        super(message);
        this.name = 'GraphqlRequestError';
        this.status = status;
        this.errors = errors;
    }
}

/**
 * @param {Response} response
 * @param {string} [label] - names the request in the error message
 * @returns {Promise<Object>} the response's `data`
 * @throws {GraphqlRequestError} on a non-2xx status, an unreadable body, a
 *   non-empty `errors` array, or a body without `data`
 */
export async function readGraphqlData(response, label = 'GraphQL request') {
    let body = null;
    try {
        body = await response.json();
    } catch (_) {
        body = null;
    }

    const errors = Array.isArray(body?.errors) && body.errors.length > 0 ? body.errors : null;

    if (!response.ok) {
        const detail = errors?.[0]?.message ? `: ${errors[0].message}` : '';
        throw new GraphqlRequestError(`${label} failed with HTTP ${response.status}${detail}`, {
            status: response.status,
            errors,
        });
    }
    if (errors) {
        throw new GraphqlRequestError(`${label} failed: ${errors[0]?.message || 'GraphQL error'}`, {
            status: response.status,
            errors,
        });
    }
    if (!body || typeof body.data !== 'object' || body.data === null) {
        throw new GraphqlRequestError(`${label} returned no data`, { status: response.status });
    }
    return body.data;
}

export default readGraphqlData;
