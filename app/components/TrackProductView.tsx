"use client";

import { useEffect } from "react";
import { trackViewItem } from "@/app/lib/firebase-analytics";

/**
 * Fires a fire-and-forget POST to record a product page view.
 * Used by the product detail page to track impressions for popularity ranking.
 */
type TrackProductViewProps = {
 productId: string;
 title: string;
 price: number | string;
 category?: string;
 storeName: string;
 storeSlug: string;
 size?: string | null;
};

export default function TrackProductView({
 productId,
 title,
 price,
 category,
 storeName,
 storeSlug,
 size,
}: TrackProductViewProps) {
 useEffect(() => {
 fetch("/api/track", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ productId }),
 }).catch(() => {});

 // Per-store VYA-marketplace analytics: log this product-page view for the store, and (once per
 // session per store) the acquisition source — so marketplace discovery counts as "Discovered via VYA".
 try {
 const key = `vs_${storeSlug}`;
 const entry = !sessionStorage.getItem(key);
 if (entry) sessionStorage.setItem(key, "1");
 const params = new URLSearchParams(window.location.search);
 const payload = JSON.stringify({
 storeSlug,
 path: window.location.pathname,
 pageType: "product",
 title,
 entry,
 referrer: document.referrer || null,
 utmSource: params.get("utm_source"),
 utmMedium: params.get("utm_medium"),
 });
 fetch("/api/track/store-visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
 } catch { /* ignore */ }

 trackViewItem(
 {
 itemId: productId,
 itemName: title,
 price,
 category,
 storeName,
 storeSlug,
 size: size ?? undefined,
 },
 "product_detail"
 );
 }, [category, price, productId, size, storeName, storeSlug, title]);

 return null;
}
