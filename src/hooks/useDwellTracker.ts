import { useEffect, useRef } from "react";

export interface TrackableArticle {
  id?: string;
  feedId?: string;
  snippet?: string;
  fullContentMarkdown?: string;
}

/**
 * Rock-solid Active Engagement Dwell Tracker:
 * 1. Active Page Visibility: Automatically pauses when document.hidden is true (background tab, minimized, screen locked).
 * 2. Idle Watchdog: Listens for user interactions (scroll, pointerdown, keydown, touchstart).
 *    If 60s pass with zero user movement, active reading pauses so walking away doesn't register false hours.
 * 3. Sanity Cap: Any single reading session is hard-capped at 20 minutes (1,200s).
 * 4. Beacon / Keepalive Transport: Uses keepalive fetch so article transitions or closing tabs never drop time.
 * 5. Target Type Detection: Properly tags 'reading_list' vs 'feed_item'.
 */
export function useDwellTracker(item: TrackableArticle | null) {
  const currentItemRef = useRef<TrackableArticle | null>(item);
  const activeSecondsRef = useRef<number>(0);
  const isIdleRef = useRef<boolean>(false);
  const lastActivityTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    currentItemRef.current = item;
    activeSecondsRef.current = 0;
    isIdleRef.current = false;
    lastActivityTimeRef.current = Date.now();

    if (!item?.id) return;

    // Reset activity timestamp on user interaction
    const onUserActivity = () => {
      lastActivityTimeRef.current = Date.now();
      isIdleRef.current = false;
    };

    const activityEvents = ["scroll", "pointerdown", "keydown", "touchstart"] as const;
    activityEvents.forEach((ev) => window.addEventListener(ev, onUserActivity, { passive: true }));

    const onVisibilityChange = () => {
      if (document.hidden) {
        isIdleRef.current = true;
      } else {
        lastActivityTimeRef.current = Date.now();
        isIdleRef.current = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // 1-second pulse timer
    const interval = setInterval(() => {
      if (document.hidden) return;

      const idleSeconds = (Date.now() - lastActivityTimeRef.current) / 1000;
      if (idleSeconds >= 60) {
        isIdleRef.current = true;
        return;
      }

      // Hard cap single session at 1,200 seconds (20 minutes)
      if (activeSecondsRef.current < 1200) {
        activeSecondsRef.current += 1;
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      activityEvents.forEach((ev) => window.removeEventListener(ev, onUserActivity));
      document.removeEventListener("visibilitychange", onVisibilityChange);

      const activeItem = currentItemRef.current;
      const dwellSeconds = activeSecondsRef.current;
      if (!activeItem?.id || dwellSeconds < 3) return;

      const articleText = activeItem.fullContentMarkdown || activeItem.snippet || "";
      const wordCount = articleText.trim().split(/\s+/).filter(Boolean).length;
      const action = dwellSeconds >= 30 ? "read" : dwellSeconds >= 10 ? "skim" : "flick";
      const targetType = activeItem.feedId ? "feed_item" : "reading_list";

      const payload = JSON.stringify({
        targetType,
        targetId: activeItem.id,
        feedId: activeItem.feedId || null,
        durationSeconds: dwellSeconds,
        wordCount,
        action,
      });

      try {
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon("/api/stats", blob);
        } else {
          fetch("/api/stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {}
    };
  }, [item?.id]);
}
