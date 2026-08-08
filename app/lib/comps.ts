// Real resale comps via SerpApi — eBay *sold* listings (actual transaction prices,
// the gold standard) plus Google Shopping (broad market). Gated behind the key AND
// an explicit enable flag, so it's fully dormant — no calls, no spend — until you
// subscribe and flip PHOTOROOM-style SERPAPI_ENABLED=true.

import { unstable_cache } from "next/cache";

const SERPAPI_URL = "https://serpapi.com/search.json";

export type Comp = { title: string; priceCents: number; currency: string; sold: boolean; source: string; link?: string; condition?: string };

export function isCompsConfigured(): boolean {
 return Boolean(process.env.SERPAPI_API_KEY) && process.env.SERPAPI_ENABLED === "true";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function serp(params: Record<string, string>): Promise<any | null> {
 const apiKey = process.env.SERPAPI_API_KEY;
 if (!apiKey) return null;
 const url = new URL(SERPAPI_URL);
 url.searchParams.set("api_key", apiKey);
 for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
 const q = (params.q ?? params._nkw ?? params.url ?? "").slice(0, 50);
 const t0 = Date.now();
 try {
 const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
 console.log(`[serpapi] call engine=${params.engine} q="${q}" ${res.ok ? "ok" : res.status} ${Date.now() - t0}ms`);
 if (!res.ok) return null;
 return await res.json();
 } catch {
 console.log(`[serpapi] call engine=${params.engine} q="${q}" error ${Date.now() - t0}ms`);
 return null;
 }
}

/** Coerce SerpApi's many price shapes (number | {extracted_value} | {raw} | {from}) into cents. */
export function priceToCents(p: any): number | null {
 let v: number | null = null;
 if (typeof p === "number") v = p;
 else if (typeof p?.extracted_value === "number") v = p.extracted_value;
 else if (typeof p?.extracted === "number") v = p.extracted; // eBay engine
 else if (typeof p?.from?.extracted_value === "number") v = p.from.extracted_value;
 else if (typeof p?.from?.extracted === "number") v = p.from.extracted; // eBay price range
 else if (typeof p?.raw === "string") { const n = parseFloat(p.raw.replace(/[^0-9.]/g, "")); v = Number.isFinite(n) ? n : null; }
 else if (typeof p === "string") { const n = parseFloat(p.replace(/[^0-9.]/g, "")); v = Number.isFinite(n) ? n : null; }
 return v && v > 0 ? Math.round(v * 100) : null;
}

export type VisualMatch = { title: string; priceCents: number | null; source: string; link?: string };

/** Reverse-image search (Google Lens) for the exact / visually-identical product.
 *  This is the single best signal for BRAND ID and true price — it finds the same
 *  piece listed across the web instead of guessing from the look. [] if not enabled. */
export async function reverseImageMatches(imageUrl: string): Promise<VisualMatch[]> {
 if (!isCompsConfigured() || !imageUrl) return [];
 const r = await serp({ engine: "google_lens", url: imageUrl, country: "us" });
 const matches = (r?.visual_matches || []) as any[];
 return matches
 .slice(0, 25)
 .map((m) => ({ title: String(m.title || ""), priceCents: priceToCents(m.price), source: String(m.source || ""), link: m.link as string | undefined }))
 .filter((m) => m.title);
}

/** Adaptive multi-frame reverse image. Sellers upload several photos but only the first
 *  ever gets searched — a bad primary frame (folded, back, a detail shot) finds nothing
 *  even when a later frame would nail the exact piece. This tries the primary first and
 *  only escalates to the next frames when the evidence so far is WEAK, merging + deduping
 *  matches across the frames it actually ran. Quota-aware: a clean product shot still
 *  costs exactly one Lens call; extra calls are spent only on the hard cases that need them.
 *  `strong(matchesSoFar)` decides "we have enough, stop" — the caller supplies it because
 *  what counts as enough (brand consensus vs. priced comps) depends on the intake context. */
export async function reverseImageBestOf(
 imageUrls: string[],
 opts?: { maxFrames?: number; strong?: (matches: VisualMatch[]) => boolean },
): Promise<{ matches: VisualMatch[]; framesUsed: number }> {
 const urls = (imageUrls || []).filter((u) => typeof u === "string" && u);
 if (!isCompsConfigured() || !urls.length) return { matches: [], framesUsed: 0 };
 const maxFrames = Math.max(1, Math.min(urls.length, opts?.maxFrames ?? 3));
 const strong = opts?.strong ?? ((ms: VisualMatch[]) => ms.filter((m) => m.priceCents && m.priceCents > 0).length >= 3);
 const merged: VisualMatch[] = [];
 const seen = new Set<string>();
 let framesUsed = 0;
 for (let i = 0; i < maxFrames; i++) {
 const found = await reverseImageMatches(urls[i]).catch(() => [] as VisualMatch[]);
 framesUsed++;
 for (const m of found) {
 const k = m.link || `${m.title}|${m.priceCents}`;
 if (seen.has(k)) continue;
 seen.add(k);
 merged.push(m);
 }
 if (strong(merged)) break; // enough evidence — don't spend more quota on this listing
 }
 return { matches: merged, framesUsed };
}

// Editorial / archival photo sources — Getty & the fashion press. Their captions are the richest
// PROVENANCE signal (who wore it, which show/season) and frequently DON'T name the brand, so they'd
// be dropped by the brand filter that guards pricing. We mine them separately for runway + celebrity.
const EDITORIAL_SOURCE = /getty|gettyimages|wireimage|imaxtree|shutterstock|vogue|wwd\.com|\bwwd\b|gorunway|firstview|nowfashion|launchmetrics|harper|harpersbazaar|elle\.com|hola|popsugar|whowhatwear|redcarpet/i;

/** Titles/captions of reverse-image matches that come from editorial/Getty sources — the raw
 *  evidence for "documented on the runway" and "as seen on <celebrity>". Kept UN-brand-filtered
 *  on purpose: a red-carpet caption naming the wearer rarely repeats the brand. [] if none. */
export function editorialCaptions(matches: VisualMatch[]): string[] {
 return matches.filter((m) => m.title && EDITORIAL_SOURCE.test(m.source || "")).map((m) => m.title).slice(0, 20);
}

/** Reverse-image matches that carry a price → resale comps. Visually-identical items
 *  are the truest comps there are, so these anchor the valuation. */
export function matchesToComps(matches: VisualMatch[]): Comp[] {
 return matches
 .filter((m) => m.priceCents && m.priceCents > 0)
 .map((m) => ({ title: m.title, priceCents: m.priceCents as number, currency: "USD", sold: false, source: m.source || "Visual match", link: m.link }));
}

// Authenticated-luxury resellers — the truest comps for designer pieces; surfaced first so
// they survive any downstream truncation before the valuation step sees them.
const PREMIUM_SOURCE = /real\s?real|vestiaire|fashionphile|rebag|luxury\s?closet|1st\s?dibs|farfetch/i;

/** Dedupe a comp set and rank authenticated-luxury sources first. */
export function rankComps(comps: Comp[]): Comp[] {
 const seen = new Set<string>();
 const unique = comps.filter((c) => { const k = c.link || `${c.title}|${c.priceCents}`; if (seen.has(k)) return false; seen.add(k); return true; });
 return unique.sort((a, b) => (PREMIUM_SOURCE.test(b.source) ? 1 : 0) - (PREMIUM_SOURCE.test(a.source) ? 1 : 0));
}

/** eBay SOLD + completed — real transaction prices (the reality anchor reverse-image can't
 *  give, since Google Lens shows asking/active listings). One SerpApi call. */
export async function fetchEbaySold(query: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 const r = await serp({ engine: "ebay", _nkw: query, ebay_domain: "ebay.com", LH_Sold: "1", LH_Complete: "1" });
 const comps: Comp[] = [];
 for (const row of (r?.organic_results || []).slice(0, 25)) {
 const cents = priceToCents(row.price);
 if (cents) comps.push({ title: String(row.title || ""), priceCents: cents, currency: "USD", sold: true, source: "eBay (sold)", link: row.link, condition: row.condition });
 }
 return comps;
}

/** Google Shopping — broad keyword market. One SerpApi call. Used as a FALLBACK when the
 *  reverse-image + eBay-sold set is thin (poor photo / very rare piece). */
export async function fetchGoogleShopping(query: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 const r = await serp({ engine: "google_shopping", q: query, gl: "us" });
 const comps: Comp[] = [];
 for (const row of (r?.shopping_results || []).slice(0, 30)) {
 const cents = priceToCents(row.extracted_price ?? row.price);
 if (cents) comps.push({ title: String(row.title || ""), priceCents: cents, currency: "USD", sold: false, source: String(row.source || "Google Shopping"), link: row.link });
 }
 return comps;
}

/** Dedicated The RealReal keyword pass. Only used by the legacy full basket below — the lean
 *  live path relies on reverse-image, which already surfaces RealReal matches natively. */
async function fetchRealRealPass(query: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 const r = await serp({ engine: "google_shopping", q: `${query} the real real`, gl: "us" });
 const comps: Comp[] = [];
 for (const row of (r?.shopping_results || []).slice(0, 20)) {
 if (!/real\s?real/i.test(String(row.source || ""))) continue;
 const cents = priceToCents(row.extracted_price ?? row.price);
 if (cents) comps.push({ title: String(row.title || ""), priceCents: cents, currency: "USD", sold: false, source: "The RealReal", link: row.link });
 }
 return comps;
}

/** Legacy full basket (eBay sold + Google Shopping + RealReal pass) — 3 SerpApi calls. Kept
 *  for the dry-run comparison; estimatePrice now uses the leaner reverse-image + eBay-sold path. */
export async function fetchComps(query: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 const [ebay, shopping, realReal] = await Promise.all([
 fetchEbaySold(query),
 fetchGoogleShopping(query),
 fetchRealRealPass(query),
 ]);
 return rankComps([...ebay, ...shopping, ...realReal]);
}

export type ResaleTrend = { momentumPct: number; trending: boolean; note: string; source: string };

/** Broad resale-world demand trend for a brand/item via Google Trends (SerpApi).
 *  Google search interest is the best cross-market proxy for real resale demand — it
 *  spans the whole secondhand world (what shoppers are hunting for across every site),
 *  not VYA's thin pilot traffic. Compares recent vs prior interest over ~3 months.
 *  Returns null when comps aren't enabled or there isn't enough signal. */
async function _fetchResaleTrendUncached(query: string): Promise<ResaleTrend | null> {
 if (!isCompsConfigured() || !query.trim()) return null;
 const r = await serp({ engine: "google_trends", q: query.trim(), data_type: "TIMESERIES", date: "today 3-m" });
 const timeline = (r?.interest_over_time?.timeline_data ?? []) as any[];
 const vals = timeline
 .map((t) => Number(t?.values?.[0]?.extracted_value ?? t?.values?.[0]?.value ?? NaN))
 .filter((n) => Number.isFinite(n));
 if (vals.length < 8) return null; // not enough of a series to trust a direction
 const half = Math.floor(vals.length / 2);
 const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / (a.length || 1);
 const prior = avg(vals.slice(0, half));
 const recent = avg(vals.slice(half));
 if (prior <= 0) return null;
 const momentumPct = Math.round(((recent - prior) / prior) * 100);
 return {
 momentumPct,
 trending: momentumPct >= 10, // a real, sustained uptick — not noise
 note: `${momentumPct >= 0 ? "+" : ""}${momentumPct}% resale search demand vs prior 3mo`,
 source: "Google Trends",
 };
}

// Cache by query (brand+category) for a week: a brand's search-trend momentum barely moves
// week to week and is shared across every listing of that brand — so this collapses the cost
// from one SerpApi call per listing to roughly one call per brand per week.
export const fetchResaleTrend = unstable_cache(_fetchResaleTrendUncached, ["resale-trend"], {
 revalidate: 604800, // 7 days
});
