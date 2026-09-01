"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { redactOnPrivateScreens } from "./analytics-redact";

// PostHog, mounted ONLY inside the seller workspace.
//
// Deliberately not in the root layout. The root layout wraps the marketplace — every shopper
// browsing vyaplatform.com — and the question this is here to answer is "what does a STORE do when
// she gets onto VYA?". Instrumenting the shopper site too would bury that in three orders of
// magnitude more traffic, and would start recording people who never agreed to be part of it.
//
// Two consequences of that placement worth knowing:
//  · Sign-in and onboarding are OUTSIDE this layout, so the funnel starts at the first workspace
//    screen. The wizard fires its own `store_onboarded` event when it finishes (see the workspace
//    layout), which is what stitches the two halves together.
//  · Nothing is captured for a signed-out visitor, because there is no workspace to be in.
//
// Everything no-ops when NEXT_PUBLIC_POSTHOG_KEY is unset, so a developer without a key — and every
// preview build — behaves exactly as before rather than erroring or silently half-initialising.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "/ingest";

export default function StoreAnalytics({ slug, isOwner }: { slug: string | null; isOwner: boolean }) {
 const pathname = usePathname();
 const search = useSearchParams();
 const started = useRef(false);
 const identified = useRef<string | null>(null);

 useEffect(() => {
  if (!KEY || started.current) return;
  started.current = true;
  posthog.init(KEY, {
   api_host: HOST,
   // The reverse proxy in next.config serves PostHog from our own origin, but the assets and the
   // UI links still need to know where PostHog actually lives.
   ui_host: "https://us.posthog.com",
   // We send pageviews ourselves below — the App Router changes the URL without a page load, so
   // PostHog's own listener would miss every in-workspace navigation after the first.
   capture_pageview: false,
   capture_pageleave: true,
   persistence: "localStorage+cookie",
   sanitize_properties: (props) => {
    // Never let a listing preview token or a magic-link parameter reach the analytics store.
    if (typeof props.$current_url === "string") props.$current_url = stripSecrets(props.$current_url);
    if (typeof props.$referrer === "string") props.$referrer = stripSecrets(props.$referrer);
    return redactOnPrivateScreens(props);
   },
  });
 }, []);

 // Identify as the STORE, not the person. A shop with two staff logins is one business asking one
 // question of the product, and counting it as two would make every funnel read wrong.
 useEffect(() => {
  if (!KEY || !slug || identified.current === slug) return;
  identified.current = slug;
  posthog.identify(slug, { store_slug: slug, is_vya_owner: isOwner });
  // Grouping as well as identifying is what makes "how many stores did X" answerable, rather than
  // only "how many sessions did X".
  posthog.group("store", slug, { name: slug, is_vya_owner: isOwner });
 }, [slug, isOwner]);

 useEffect(() => {
  if (!KEY || !started.current) return;
  const qs = search?.toString();
  posthog.capture("$pageview", {
   $current_url: stripSecrets(window.location.href),
   workspace_path: pathname + (qs ? `?${qs}` : ""),
  });
 }, [pathname, search]);

 return null;
}


/** Strip the query parameters that carry a credential rather than a fact about the page. */
function stripSecrets(url: string): string {
 try {
  const u = new URL(url, "https://getvya.ai");
  for (const k of ["token", "code", "callbackUrl", "next", "redirect", "key", "secret"]) u.searchParams.delete(k);
  return u.toString();
 } catch {
  return url;
 }
}
