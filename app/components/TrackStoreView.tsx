"use client";

import { useEffect } from "react";
import { trackStoreView } from "@/app/lib/firebase-analytics";

type TrackStoreViewProps = {
 storeSlug: string;
 storeName: string;
 inventoryCount: number;
};

export default function TrackStoreView({
 storeSlug,
 storeName,
 inventoryCount,
}: TrackStoreViewProps) {
 useEffect(() => {
 trackStoreView({
 storeSlug,
 storeName,
 inventoryCount,
 });

 // Per-store VYA-marketplace analytics: record this store-page view (what pages shoppers browse)
 // and, once per session per store, the acquisition source ("Discovered via VYA" for internal nav).
 try {
 const key = `vs_${storeSlug}`;
 const entry = !sessionStorage.getItem(key);
 if (entry) sessionStorage.setItem(key, "1");
 const params = new URLSearchParams(window.location.search);
 const payload = JSON.stringify({
 storeSlug,
 path: window.location.pathname,
 pageType: "store",
 title: storeName,
 entry,
 referrer: document.referrer || null,
 utmSource: params.get("utm_source"),
 utmMedium: params.get("utm_medium"),
 });
 // A real fetch (not sendBeacon) so the session cookie in the response is applied.
 fetch("/api/track/store-visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
 } catch { /* ignore */ }
 }, [inventoryCount, storeName, storeSlug]);

 return null;
}
