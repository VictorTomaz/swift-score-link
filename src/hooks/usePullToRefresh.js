import { useEffect, useRef, useState, useCallback } from 'react';

export function usePullToRefresh(onRefresh, threshold = 80) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const scrollElementRef = useRef(null);
  const isRefreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  // Keep the latest onRefresh without re-registering listeners
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  const setPull = useCallback((dist) => {
    pullDistanceRef.current = dist;
    setPullDistance(dist);
  }, []);

  useEffect(() => {
    const handleTouchStart = (e) => {
      const element = e.target.closest('[data-pull-to-refresh]');
      if (!element) return;
      // Only start if the page is scrolled to the very top
      if (window.scrollY > 0) return;
      scrollElementRef.current = element;
      startYRef.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e) => {
      if (!scrollElementRef.current || isRefreshingRef.current) return;
      if (window.scrollY > 0) {
        scrollElementRef.current = null;
        if (pullDistanceRef.current > 0) setPull(0);
        return;
      }
      const dist = Math.max(0, e.touches[0].clientY - startYRef.current);
      // Ignore tiny movements — CSS overscroll-behavior:none handles native rubber-band
      if (dist < 10) return;
      // Clamp to 1.5x threshold for visual cap
      const clamped = Math.min(dist, threshold * 1.5);
      // Throttle re-renders: only update state when distance changes by 2px+
      if (Math.abs(clamped - pullDistanceRef.current) >= 2) {
        setPull(clamped);
      }
    };

    const handleTouchEnd = async () => {
      const dist = pullDistanceRef.current;
      if (dist >= threshold && scrollElementRef.current && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        setPull(0);
        try {
          await onRefreshRef.current();
        } finally {
          setIsRefreshing(false);
          isRefreshingRef.current = false;
        }
      } else {
        setPull(0);
      }
      scrollElementRef.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [threshold, setPull]);

  return { isRefreshing, pullDistance };
}