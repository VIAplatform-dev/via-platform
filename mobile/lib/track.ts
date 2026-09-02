import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { apiPost } from "./api";

// Telling the backend what someone looked at, and for how long.
//
// WHY THIS MATTERS MORE THAN IT LOOKS. /api/public/for-you already ranks on a weighted blend of
// clicks, favourites and views — a real per-person model that has been there all along. The app
// never sent any of it, so "Curated for You" ran on favourites alone, and on nothing at all for a
// new user. This is the missing half.
//
// Product ids on the analytics side are COMPOSITE — "store-slug-123" — because views and clicks
// span stores whose own ids collide. Sending the bare int records a row that joins to nothing.

export function compositeId(storeSlug: string, id: number | string): string {
  return `${storeSlug}-${id}`;
}

/** Best-effort: a dropped view costs a little ranking signal, never the screen. */
export function trackView(storeSlug: string, id: number | string, dwellMs?: number): void {
  if (!storeSlug) return;
  void apiPost("/api/track", {
    productId: compositeId(storeSlug, id),
    ...(dwellMs != null ? { dwellMs } : {}),
  }).catch(() => {});
}

/**
 * Record a view on open and its dwell time on leave.
 *
 * Two calls, deliberately: the view is written immediately so it survives the app being killed,
 * and the dwell attaches to that same row when the screen is left. Backgrounding STOPS the clock —
 * a phone in a pocket on a product page is not interest, and counting it would let one abandoned
 * screen outweigh a hundred genuine looks.
 */
export function useTrackedView(storeSlug: string | undefined, id: number | string | undefined) {
  const started = useRef<number | null>(null);
  const accumulated = useRef(0);
  const sent = useRef(false);

  useEffect(() => {
    if (!storeSlug || id == null) return;

    trackView(storeSlug, id);
    started.current = Date.now();
    accumulated.current = 0;
    sent.current = false;

    const pause = () => {
      if (started.current != null) {
        accumulated.current += Date.now() - started.current;
        started.current = null;
      }
    };
    const resume = () => { if (started.current == null) started.current = Date.now(); };

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") resume();
      else pause();
    });

    return () => {
      sub.remove();
      pause();
      if (!sent.current && accumulated.current > 500) {
        sent.current = true;
        trackView(storeSlug, id, accumulated.current);
      }
    };
  }, [storeSlug, id]);
}
