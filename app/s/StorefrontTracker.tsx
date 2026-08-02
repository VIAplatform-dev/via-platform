"use client";

import { useEffect } from "react";

// Fires one analytics beacon per storefront page load for the block-builder storefront (the
// captured-site renderer records server-side; this brings the block builder to parity). Sends the
// real external referrer (document.referrer) so traffic-source attribution works. Fire-and-forget,
// keepalive so it still lands if the shopper navigates away immediately. Never rendered in preview.
export default function StorefrontTracker({ slug, pageType, itemId, search, priceCents }: { slug: string; pageType: string; itemId?: string; search?: string; priceCents?: number }) {
 useEffect(() => {
  if (!slug) return;
  try {
   const params = new URLSearchParams(window.location.search);
   const body = JSON.stringify({
    slug,
    pageType,
    itemId: itemId || null,
    priceCents: priceCents || null,
    search: search || null,
    path: window.location.pathname,
    referrer: document.referrer || null,
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
   });
   fetch("/api/storefront/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* analytics must never break the page */ }
 }, [slug, pageType, itemId, search, priceCents]);
 return null;
}
