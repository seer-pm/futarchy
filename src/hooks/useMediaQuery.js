import { useEffect, useState } from 'react';

/**
 * Track a CSS media query from JS, so a breakpoint can decide whether a
 * component *mounts* rather than just whether it is visible. Tailwind's
 * `hidden`/`md:block` only hides — the component still mounts and still
 * fetches.
 *
 * Always false on the first render (the static export has no window),
 * then corrected on mount, which keeps hydration consistent.
 *
 * @param {string} query - e.g. '(min-width: 768px)'
 */
export function useMediaQuery(query) {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;

        const mediaQuery = window.matchMedia(query);
        const update = (event) => setMatches(event.matches);

        setMatches(mediaQuery.matches);
        mediaQuery.addEventListener('change', update);
        return () => mediaQuery.removeEventListener('change', update);
    }, [query]);

    return matches;
}

export default useMediaQuery;
