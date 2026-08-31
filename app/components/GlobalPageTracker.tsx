"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { randomId } from "@/app/lib/random-id";

const SOURCE_ALIASES: Record<string, string> = {
 ig: "instagram",
 fb: "facebook",
 tw: "twitter",
 tt: "tiktok",
 yt: "youtube",
 li: "linkedin",
};

function normalizeSource(s: string): string {
 const lower = s.toLowerCase().trim();
 return SOURCE_ALIASES[lower] ?? lower;
}

function inferPageType(pathname: string): string {
 if (pathname === "/") return "homepage";
 if (pathname.startsWith("/stores/")) return "store";
 if (pathname === "/stores") return "stores-list";
 if (pathname.startsWith("/categories/")) return "category";
 if (pathname === "/categories") return "categories-list";
 if (pathname.startsWith("/products/")) return "product";
 if (pathname.startsWith("/browse")) return "browse";
 if (pathname.startsWith("/search")) return "search";
 if (pathname.startsWith("/new-arrivals")) return "new-arrivals";
 if (pathname.startsWith("/brands/")) return "brand";
 if (pathname === "/brands") return "brands";
 if (pathname.startsWith("/collections/")) return "collection";
 if (pathname === "/collections") return "collections-list";
 if (pathname.startsWith("/account")) return "account";
 if (pathname.startsWith("/stories/")) return "story";
 if (pathname === "/stories") return "stories";
 if (pathname.startsWith("/editors-picks")) return "editors-picks";
 if (pathname.startsWith("/you-might-like")) return "you-might-like";
 if (pathname.startsWith("/sourcing")) return "sourcing";
 if (pathname.startsWith("/membership")) return "membership";
 if (pathname.startsWith("/partner-with-vya")) return "partner";
 if (pathname.startsWith("/for-stores")) return "for-stores";
 if (pathname.startsWith("/store/")) return "store-portal";
 if (pathname.startsWith("/login")) return "login";
 if (pathname.startsWith("/register")) return "register";
 if (pathname.startsWith("/waitlist")) return "waitlist";
 if (pathname.startsWith("/cart")) return "cart";
 if (pathname.startsWith("/out/")) return "outbound";
 if (pathname.startsWith("/faqs")) return "faqs";
 if (pathname.startsWith("/privacy")) return "privacy";
 if (pathname.startsWith("/terms")) return "terms";
 if (pathname.startsWith("/trust")) return "trust";
 if (pathname.startsWith("/unsubscribe")) return "unsubscribe";
 if (pathname.startsWith("/pilot-pending")) return "pilot-pending";
 if (pathname.startsWith("/admin")) return "admin";
 return "other";
}

export default function GlobalPageTracker() {
 const pathname = usePathname();
 const { data: session, status } = useSession();
 const sentAnon = useRef(false);
 const sentWithUser = useRef(false);
 // In-memory ref so UTM data survives even when sessionStorage is blocked
 // (TikTok in-app browser and some other WebViews block web storage).
 const utmPayloadRef = useRef<Record<string, string | null> | null>(null);

 // Session flow tracking refs
 const sessionIdRef = useRef<string | null>(null);
 const prevPathRef = useRef<string | null>(null);
 const pageEnteredAtRef = useRef<number>(Date.now());

 // Session ID init: generate or retrieve from sessionStorage on mount
 useEffect(() => {
 if (typeof window === "undefined") return;
 let sid: string | null = null;
 try {
 sid = sessionStorage.getItem("via_session_id");
 if (!sid) {
 sid = randomId();
 sessionStorage.setItem("via_session_id", sid);
 }
 } catch {
 // sessionStorage blocked (e.g. TikTok in-app browser) — keep in memory only
 if (!sessionIdRef.current) {
 sid = randomId();
 }
 }
 if (sid) sessionIdRef.current = sid;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // Step 1: Capture UTM/referrer data on first page load.
 // Store in both the in-memory ref and sessionStorage (as a cross-navigation fallback).
 // We don't send the beacon yet because auth hasn't resolved — user_id would be null.
 useEffect(() => {
 if (typeof window === "undefined") return;

 // sessionStorage guard — skip if already captured this session.
 // Wrapped in try/catch because some WebViews (TikTok) block storage access.
 try {
 if (sessionStorage.getItem("via_utm_data")) return;
 } catch {}

 // If the in-memory ref is already populated, Step 1 already ran this mount.
 if (utmPayloadRef.current) return;

 const params = new URLSearchParams(window.location.search);

 // The gated homepage server-redirects unauthenticated visitors to
 // /login?callbackUrl=/%3Futm_source%3Dinstagram, which buries the UTM params
 // one level deep — so a tagged bio link (vyaplatform.com/?utm_source=instagram)
 // arrives with no TOP-LEVEL utm_source and was being recorded as "direct". Recover
 // them from the redirect-carrier param before reading.
 const carrier = params.get("callbackUrl") || params.get("callback") || params.get("next") || params.get("redirect");
 let nested: URLSearchParams | null = null;
 if (carrier) {
 try {
 const decoded = carrier.startsWith("http") ? new URL(carrier) : new URL(carrier, window.location.origin);
 nested = decoded.searchParams;
 } catch {}
 }
 const pick = (key: string) => params.get(key) ?? nested?.get(key) ?? null;

 let utmSource = pick("utm_source") ? normalizeSource(pick("utm_source")!) : null;
 let utmMedium = pick("utm_medium");
 let utmCampaign = pick("utm_campaign");
 const utmContent = pick("utm_content");
 const utmTerm = pick("utm_term");

 if (!utmSource) {
 const ref = document.referrer;
 if (ref) {
 try {
 const refHost = new URL(ref).hostname.replace(/^www\./, "");
 const REFERRER_MAP: Record<string, string> = {
 "instagram.com": "instagram",
 "l.instagram.com": "instagram",
 "tiktok.com": "tiktok",
 "vm.tiktok.com": "tiktok",
 "t.co": "twitter",
 "twitter.com": "twitter",
 "x.com": "twitter",
 "facebook.com": "facebook",
 "m.facebook.com": "facebook",
 "l.facebook.com": "facebook",
 "fb.com": "facebook",
 "linkedin.com": "linkedin",
 "lnkd.in": "linkedin",
 "threads.net": "threads",
 "pinterest.com": "pinterest",
 "pin.it": "pinterest",
 "youtube.com": "youtube",
 "youtu.be": "youtube",
 "substack.com": "substack",
 "reddit.com": "reddit",
 };
 const inferred = REFERRER_MAP[refHost];
 if (inferred) {
 utmSource = inferred;
 utmMedium = utmMedium ?? "social";
 utmCampaign = utmCampaign ?? "organic";
 }
 } catch {}
 }
 }

 // Infer source from User-Agent for social in-app browsers that strip referrer
 // (TikTok and Instagram both do this — no document.referrer, no UTM params)
 if (!utmSource) {
 const ua = navigator.userAgent;
 if (/BytedanceWebview|musical_ly|TikTok/i.test(ua)) {
 utmSource = "tiktok";
 utmMedium = utmMedium ?? "social";
 utmCampaign = utmCampaign ?? "organic";
 } else if (/Instagram/i.test(ua)) {
 utmSource = "instagram";
 utmMedium = utmMedium ?? "social";
 utmCampaign = utmCampaign ?? "organic";
 }
 }

 // No tracked source — label by the browser they arrived in (Safari, Chrome, …)
 // instead of a flat "direct", so typed/bookmarked/organic traffic is at least
 // categorized. These rank BELOW real sources but ABOVE bare "direct".
 if (!utmSource) {
 const ua = navigator.userAgent;
 if (/Edg/i.test(ua)) utmSource = "edge";
 else if (/SamsungBrowser/i.test(ua)) utmSource = "samsung";
 else if (/CriOS|Chrome/i.test(ua)) utmSource = "chrome";
 else if (/FxiOS|Firefox/i.test(ua)) utmSource = "firefox";
 else if (/Safari/i.test(ua)) utmSource = "safari";
 else utmSource = "web";
 utmMedium = utmMedium ?? "direct";
 }

 const utmPayload = {
 utm_source: utmSource,
 utm_medium: utmMedium ?? null,
 utm_campaign: utmCampaign ?? null,
 utm_content: utmContent ?? null,
 utm_term: utmTerm ?? null,
 landing_path: window.location.pathname,
 };

 // Primary: in-memory ref — always works regardless of browser storage policy.
 utmPayloadRef.current = utmPayload;

 // Window global so acquisitionSource() (called from signup forms) can read the
 // real source even when session/localStorage is blocked — the case for the
 // Instagram & TikTok in-app browsers that /IG and /TT bio links open in.
 try {
 (window as unknown as { __viaUtmSource?: string }).__viaUtmSource = utmSource;
 } catch {}

 // Secondary: sessionStorage for cross-navigation persistence within the same tab.
 try {
 sessionStorage.setItem("via_utm_data", JSON.stringify(utmPayload));
 } catch {}

 // Tertiary: a first-party cookie — survives full-page redirects, OAuth round-trips,
 // and new tabs (where sessionStorage/in-memory are lost), so the source still links
 // to the account at sign-up.
 try {
 document.cookie = `via_utm=${encodeURIComponent(JSON.stringify(utmPayload))};path=/;max-age=2592000;samesite=lax`;
 } catch {}

 // Also persist to localStorage for click attribution (30-day window).
 // May fail silently in TikTok browser — click attribution is best-effort.
 try {
 localStorage.setItem("via_utm", JSON.stringify({
 utm_source: utmSource,
 utm_medium: utmMedium ?? null,
 expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000,
 }));
 } catch {}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // Step 2: Once auth resolves, send the UTM data with the real user_id.
 // Reads from the in-memory ref first; falls back to sessionStorage for cases
 // where the component re-mounted (e.g. after a full page navigation) and the
 // ref was reset but sessionStorage survived.
 useEffect(() => {
 if (status === "loading") return;

 // Read the captured source (in-memory ref, or sessionStorage after a full nav).
 let data: Record<string, string | null> | null = utmPayloadRef.current;
 if (!data) {
 try {
 const stored = sessionStorage.getItem("via_utm_data");
 if (stored) data = JSON.parse(stored);
 } catch {}
 }
 if (!data) {
 // Cookie fallback — the one store that survives OAuth redirects + new tabs.
 try {
 const m = document.cookie.match(/(?:^|;\s*)via_utm=([^;]+)/);
 if (m) data = JSON.parse(decodeURIComponent(m[1]));
 } catch {}
 }
 if (!data) return;

 const userId = status === "authenticated"
 ? ((session?.user as { id?: string } | undefined)?.id ?? null)
 : null;

 // Send at most once anonymously and once with a user_id. The user_id send is
 // what links the source to the account — critical when someone lands logged
 // out (no user_id yet) and signs up later: we keep the captured source around
 // and re-send it, tied to the user, once auth resolves. (Previously it fired
 // once — usually anonymously — then locked, so most signups had no linked source.)
 if (userId) {
 if (sentWithUser.current) return;
 sentWithUser.current = true;
 utmPayloadRef.current = null; // linked to the account now — safe to clear
 try {
 sessionStorage.removeItem("via_utm_data");
 } catch {}
 try {
 document.cookie = "via_utm=;path=/;max-age=0";
 } catch {}
 } else {
 if (sentAnon.current) return;
 sentAnon.current = true;
 // Keep the captured data so the later authenticated send can re-use it.
 }

 const payload = JSON.stringify({ ...data, user_id: userId });

 if (navigator.sendBeacon) {
 navigator.sendBeacon("/api/track-utm", new Blob([payload], { type: "application/json" }));
 } else {
 fetch("/api/track-utm", {
 method: "POST",
 body: payload,
 headers: { "Content-Type": "application/json" },
 keepalive: true,
 }).catch(() => {});
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [status]);

 // Step 3: Track page views for authenticated users
 useEffect(() => {
 // Wait until session has resolved — never fire with a null user_id
 if (status !== "authenticated") return;
 const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
 if (!userId) return;

 // Don't track admin activity — it would inflate WAU/MAU metrics
 if (pathname.startsWith("/admin")) return;

 const pageType = inferPageType(pathname);
 const segments = pathname.split("/");
 const pageSlug = segments[2] ?? null;

 // Capture referrer path and time on previous page before updating
 const referrerPath = prevPathRef.current;
 const timeOnPageMs = prevPathRef.current !== null
 ? Math.max(0, Date.now() - pageEnteredAtRef.current)
 : null;

 // Update refs for next navigation
 prevPathRef.current = pathname;
 pageEnteredAtRef.current = Date.now();

 const payload = JSON.stringify({
 pageType,
 pageSlug,
 userId,
 sessionId: sessionIdRef.current,
 fullPath: pathname,
 referrerPath,
 timeOnPageMs,
 });

 if (navigator.sendBeacon) {
 navigator.sendBeacon("/api/track-page", new Blob([payload], { type: "application/json" }));
 } else {
 fetch("/api/track-page", {
 method: "POST",
 body: payload,
 headers: { "Content-Type": "application/json" },
 keepalive: true,
 }).catch(() => {});
 }
 // pathname changes on every navigation; status/session fire once when auth resolves
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [pathname, status]);

 return null;
}
