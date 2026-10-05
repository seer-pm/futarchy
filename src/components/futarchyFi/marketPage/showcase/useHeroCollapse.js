import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';

const useHeroCollapse = () => {
  const [isScrolled, setIsScrolled] = useState(false);

  // The sticky hero collapses on desktop once the page scrolls. Without a
  // placeholder the content below jumps up by the height it loses, moving
  // whatever is under the cursor mid-click. heroReserve re-adds that height
  // as a spacer at the top of the page content so nothing shifts.
  const heroRef = useRef(null);
  const [heroEl, setHeroEl] = useState(null);
  const attachHeroRef = useCallback((el) => {
    heroRef.current = el;
    setHeroEl(el);
  }, []);
  const expandedHeroHeightRef = useRef(0);
  const isScrolledRef = useRef(false);
  const [heroReserve, setHeroReserve] = useState(0);
  const syncHeroReserve = useCallback(() => {
    const el = heroRef.current;
    if (!el) return;
    const height = el.offsetHeight;
    if (!isScrolledRef.current) {
      expandedHeroHeightRef.current = height;
      setHeroReserve(0);
    } else {
      setHeroReserve(Math.max(0, expandedHeroHeightRef.current - height));
    }
  }, []);
  // Layout effect: measure after the collapse commits but before paint.
  useLayoutEffect(() => {
    isScrolledRef.current = isScrolled;
    syncHeroReserve();
  }, [isScrolled, syncHeroReserve]);
  // Follow later size changes (data loading, the 300ms padding transition).
  useEffect(() => {
    if (!heroEl || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(syncHeroReserve);
    observer.observe(heroEl);
    return () => observer.disconnect();
  }, [heroEl, syncHeroReserve]);

  // Scroll detection for minimized header - DESKTOP ONLY with animation lock
  useEffect(() => {
    let isAnimating = false;
    let animationTimeout = null;

    const handleScroll = () => {
      // Only apply on desktop (lg breakpoint = 1024px and up)
      const isDesktop = window.innerWidth >= 1024;
      if (!isDesktop) {
        setIsScrolled(false);
        return;
      }

      // Don't update during animation to prevent feedback loop
      if (isAnimating) return;

      const shouldMinimize = window.scrollY > 0;

      // Only update if state actually changes
      setIsScrolled((prevScrolled) => {
        if (prevScrolled !== shouldMinimize) {
          // Lock updates during animation
          isAnimating = true;

          // Clear any existing timeout
          if (animationTimeout) clearTimeout(animationTimeout);

          // Unlock after animation completes (300ms)
          animationTimeout = setTimeout(() => {
            isAnimating = false;
          }, 350); // Slightly longer than CSS transition

          return shouldMinimize;
        }
        return prevScrolled;
      });
    };

    // Also check on resize
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      if (!isDesktop) {
        setIsScrolled(false);
        isAnimating = false;
      } else {
        handleScroll();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (animationTimeout) clearTimeout(animationTimeout);
    };
  }, []);

  return { isScrolled, attachHeroRef, heroReserve };
};

export { useHeroCollapse };
