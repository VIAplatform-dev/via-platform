import { neon } from "@neondatabase/serverless";
import { inferCategoryFromTitle } from "../loadStoreProducts";
import { normalizeColor } from "../colorNormalize";
import { WHOLE_WORD_ALIASES } from "../brandData";
import { resolveBrand } from "./brands";
import { loadBrandRef } from "./brands-db";
import { loadEraBuckets, ensureDataLayerTables } from "./events-db";
import { inferEra } from "./enrich";
import { AI_MODELS } from "../ai-models";

// ───────────────────────────────────────────────────────────────────────────
// Substack culture signal (POC) — the LEADING, editorial layer.
//
// Fashion writers on Substack predict trends before they show up in resale demand. We poll a
// ROSTER of publications (tracking the fashion & beauty leaderboard, refreshed weekly), extract
// the trends each post is calling, map them to the SAME canonical segments the rest of the model
// uses (brand / era / color / category) plus a NEW `style` dimension the quantitative side can't
// see, and build a WEEKLY CONSENSUS: a trend counts when MANY independent writers converge on it,
// not because one loud voice said it. It's a soft, leading signal — it informs "emerging / watch",
// never a hard "source now" on its own.
// ───────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CULTURE_MODEL = AI_MODELS.voice; // internal, mechanical, low-volume → the cheap tier
const CONSENSUS_MIN_WRITERS = 2; // a trend needs ≥ this many distinct writers in the window to count

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export function isSubstackConfigured(): boolean {
 return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type SegmentType = "brand" | "era" | "color" | "category" | "style";

let ensured = false;
async function ensureTables(): Promise<void> {
 if (ensured) return;
 const sql = db();
 // The roster of publications we pull from (tracks the leaderboard; editable without a deploy).
 await sql`
  CREATE TABLE IF NOT EXISTS substack_sources (
   id SERIAL PRIMARY KEY,
   feed_url TEXT NOT NULL UNIQUE,
   name TEXT,
   list TEXT,               -- 'all' | 'rising' (leaderboard) | 'manual'
   rank INT,                -- position in Substack's ranking (0 = top)
   enabled BOOLEAN NOT NULL DEFAULT true,
   added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   discovered_at TIMESTAMPTZ,
   last_fetched_at TIMESTAMPTZ
  )
 `;
 await sql`ALTER TABLE substack_sources ADD COLUMN IF NOT EXISTS rank INT`;
 await sql`ALTER TABLE substack_sources ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ`;
 // Posts we've already processed (dedupe by guid) — also the audit trail for extraction.
 await sql`
  CREATE TABLE IF NOT EXISTS substack_posts (
   guid TEXT PRIMARY KEY,
   source_name TEXT,
   url TEXT,
   title TEXT,
   published_at TIMESTAMPTZ,
   processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
 `;
 // The extracted trend mentions — one row per (post × segment the post calls out).
 await sql`
  CREATE TABLE IF NOT EXISTS culture_mentions (
   id SERIAL PRIMARY KEY,
   post_guid TEXT,
   source_name TEXT,
   segment_type TEXT NOT NULL,
   segment_value TEXT NOT NULL,
   direction TEXT,          -- 'emerging' | 'rising' | 'fading' | 'neutral'
   quote TEXT,
   published_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_culture_seg ON culture_mentions(segment_type, segment_value, published_at)`;
 ensured = true;
}

// ── Roster management ────────────────────────────────────────────────────────
export type SubstackSource = { id: number; feedUrl: string; name: string | null; list: string | null; enabled: boolean };

// Normalize any Substack URL a user pastes into its RSS feed URL.
export function toFeedUrl(input: string): string | null {
 const s = (input || "").trim();
 if (!s) return null;
 if (/\/feed\/?$/.test(s)) return s.replace(/\/$/, "");
 const m = /^https?:\/\/([a-z0-9-]+)\.substack\.com/i.exec(s) || /^([a-z0-9-]+)\.substack\.com/i.exec(s);
 if (m) return `https://${m[1]}.substack.com/feed`;
 // A bare handle → assume a substack subdomain.
 if (/^[a-z0-9-]+$/i.test(s)) return `https://${s}.substack.com/feed`;
 return null;
}

export async function addSubstackSource(input: string, name?: string, list = "manual"): Promise<{ ok: boolean; feedUrl?: string; error?: string }> {
 await ensureTables();
 const feedUrl = toFeedUrl(input);
 if (!feedUrl) return { ok: false, error: "Couldn't turn that into a Substack feed URL." };
 await db()`
  INSERT INTO substack_sources (feed_url, name, list) VALUES (${feedUrl}, ${name ?? null}, ${list})
  ON CONFLICT (feed_url) DO UPDATE SET enabled = true, name = COALESCE(EXCLUDED.name, substack_sources.name)
 `.catch(() => {});
 return { ok: true, feedUrl };
}

export async function listSubstackSources(): Promise<SubstackSource[]> {
 await ensureTables();
 const rows = (await db()`SELECT id, feed_url, name, list, enabled FROM substack_sources ORDER BY added_at DESC`.catch(() => [])) as { id: number; feed_url: string; name: string | null; list: string | null; enabled: boolean }[];
 return rows.map((r) => ({ id: r.id, feedUrl: r.feed_url, name: r.name, list: r.list, enabled: r.enabled }));
}

// ── Auto-discovery: Substack's OWN ranked Fashion & Beauty leaderboard ───────
// The roster is not hand-picked — it's Substack's algorithmic ranking (by subscribers/engagement),
// so there's no selection bias toward writers WE like. Refreshed weekly; non-fashion posts from any
// publication contribute nothing (the extractor returns [] for them), so the list self-cleans.
const FASHION_CATEGORY_ID = 49715; // Substack "Fashion & Beauty"
const LEADERBOARD_LISTS = ["all", "rising"] as const;

export async function discoverLeaderboard(opts: { maxPerList?: number } = {}): Promise<{ discovered: number; lists: Record<string, number> }> {
 await ensureTables();
 const sql = db();
 const maxPer = opts.maxPerList ?? 40;
 const lists: Record<string, number> = {};
 let discovered = 0;
 for (const list of LEADERBOARD_LISTS) {
  let page = 0, got = 0;
  while (got < maxPer && page < 6) {
   const res = await fetch(`https://substack.com/api/v1/category/public/${FASHION_CATEGORY_ID}/${list}?page=${page}`, {
    headers: { "User-Agent": "VYA-SourcingBot/1.0 (+https://vyaplatform.com)", "Accept": "application/json" },
   }).catch(() => null);
   if (!res || !res.ok) break;
   const data = (await res.json().catch(() => null)) as { publications?: Array<{ name?: string; subdomain?: string }>; more?: boolean } | null;
   const pubs = data?.publications ?? [];
   if (!pubs.length) break;
   for (const p of pubs) {
    if (got >= maxPer) break;
    const sub = (p.subdomain || "").trim();
    if (!sub) continue;
    const feedUrl = `https://${sub}.substack.com/feed`;
    const name = (p.name || sub).slice(0, 120);
    await sql`
     INSERT INTO substack_sources (feed_url, name, list, rank, discovered_at) VALUES (${feedUrl}, ${name}, ${list}, ${got}, NOW())
     ON CONFLICT (feed_url) DO UPDATE SET enabled = true, name = EXCLUDED.name, list = EXCLUDED.list, rank = EXCLUDED.rank, discovered_at = NOW()
    `.catch(() => {});
    got++; discovered++;
   }
   if (!data?.more) break;
   page++;
  }
  lists[list] = got;
 }
 return { discovered, lists };
}

// ── RSS parsing (no external dep) ────────────────────────────────────────────
export type FeedItem = { title: string; link: string; guid: string; pubDate: string; content: string };

const stripCdata = (s: string) => s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
const stripTags = (s: string) =>
 s.replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

export function parseFeed(xml: string): FeedItem[] {
 const items: FeedItem[] = [];
 const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
 for (const block of blocks) {
  const pick = (tag: string) => {
   const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
   return m ? stripCdata(m[1].trim()).trim() : "";
  };
  const title = stripTags(pick("title"));
  const link = pick("link") || (/<link[^>]*href="([^"]+)"/i.exec(block)?.[1] ?? "");
  const guid = pick("guid") || link;
  const content = stripTags(pick("content:encoded") || pick("description"));
  if (title && guid) items.push({ title, link, guid, pubDate: pick("pubDate"), content });
 }
 return items;
}

async function fetchFeed(feedUrl: string): Promise<FeedItem[]> {
 const res = await fetch(feedUrl, { headers: { "User-Agent": "VYA-SourcingBot/1.0 (+https://vyaplatform.com)" } }).catch(() => null);
 if (!res || !res.ok) return [];
 const xml = await res.text().catch(() => "");
 return parseFeed(xml);
}

// ── LLM extraction → canonical segments ──────────────────────────────────────
type RawMention = { type: string; value: string; direction?: string };

const EXTRACT_PROMPT = `You extract WEARABLE VINTAGE/RESALE FASHION trends a post is calling out — for a secondhand clothing marketplace. Return ONLY a JSON array (no prose) of at most 10 objects:
[{"type":"brand|era|color|category|style","value":"<short canonical value>","direction":"emerging|rising|fading|neutral"}]
Rules:
- Only include a trend the writer is actually SIGNALING as notable/rising/fading — not every noun. If the post isn't about wearable fashion trends, return [].
- STRICTLY EXCLUDE beauty, skincare, makeup, fragrance/perfume, wellness, cosmetic procedures, hair, fitness, food, tech, and general lifestyle/politics/culture-commentary. This marketplace sells CLOTHING, SHOES, BAGS, and ACCESSORIES only.
- type "color": a single clothing colour word (e.g. "teal","burgundy","butter yellow"→"yellow").
- type "era": a decade/era of the garment (e.g. "Y2K","1990s","1970s").
- type "category": a garment/accessory type (e.g. "bags","dresses","boots","denim","scarves").
- type "style": a silhouette / cut / aesthetic / detail of clothing (e.g. "dropped waist","barrel jeans","boat neck","wide-leg","balletcore"). This is the richest signal — capture it, but it MUST be about how a garment looks/fits, never a lifestyle/beauty vibe.
- type "brand": a specific FASHION label/designer only if named as trending (never a beauty brand).
- "value" is short (1-3 words), lowercase. Never invent; only what the text supports.
Post title: `;

async function extractRaw(title: string, content: string): Promise<RawMention[]> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) return [];
 const body = `${EXTRACT_PROMPT}"${title}"\n\nPost text (may be truncated):\n${content.slice(0, 4500)}`;
 const res = await fetch(ANTHROPIC_URL, {
  method: "POST",
  headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({ model: CULTURE_MODEL, max_tokens: 800, messages: [{ role: "user", content: [{ type: "text", text: body }] }] }),
 }).catch(() => null);
 if (!res || !res.ok) return [];
 const data = (await res.json().catch(() => null)) as { content?: Array<{ text?: string }> } | null;
 const text = data?.content?.[0]?.text ?? "";
 const jsonStr = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
 try {
  const arr = JSON.parse(jsonStr);
  return Array.isArray(arr) ? (arr as RawMention[]) : [];
 } catch { return []; }
}

// Map a raw extracted mention to the site's CANONICAL vocabulary so it reconciles with market_metrics.
// style stays free-form (a new dimension). Returns null when a value can't be mapped and must be dropped.
function canonicalize(m: RawMention, brandRef: Awaited<ReturnType<typeof loadBrandRef>>, buckets: Awaited<ReturnType<typeof loadEraBuckets>>): { type: SegmentType; value: string } | null {
 const v = (m.value || "").trim().toLowerCase();
 if (!v) return null;
 switch (m.type) {
  case "color": { const c = normalizeColor(v); return c ? { type: "color", value: c } : null; }
  case "era": { const e = inferEra(v, buckets); return e ? { type: "era", value: e } : null; }
  case "category": { const c = inferCategoryFromTitle(v) as string | null; return c ? { type: "category", value: c } : null; }
  case "brand": { const b = resolveBrand(v, brandRef, WHOLE_WORD_ALIASES); return b ? { type: "brand", value: b } : null; }
  case "style": return { type: "style", value: v.slice(0, 40) };
  default: return null;
 }
}

// ── The pull job ─────────────────────────────────────────────────────────────
export type PullResult = { sources: number; posts: number; mentions: number };

export async function pullSubstack(opts: { maxPostsPerSource?: number } = {}): Promise<PullResult> {
 await ensureTables();
 await ensureDataLayerTables();
 const sql = db();
 const sources = await listSubstackSources();
 const enabled = sources.filter((s) => s.enabled);
 if (enabled.length === 0) return { sources: 0, posts: 0, mentions: 0 };

 const [brandRef, buckets] = await Promise.all([loadBrandRef(), loadEraBuckets()]);
 const maxPer = opts.maxPostsPerSource ?? 8;
 let posts = 0, mentions = 0;

 for (const src of enabled) {
  const name = src.name || (/\/\/([a-z0-9-]+)\./i.exec(src.feedUrl)?.[1] ?? src.feedUrl);
  const items = await fetchFeed(src.feedUrl);
  // Which of these are new (not already processed)?
  const guids = items.slice(0, maxPer).map((i) => i.guid);
  const seen = guids.length
   ? new Set(((await sql`SELECT guid FROM substack_posts WHERE guid = ANY(${guids}::text[])`.catch(() => [])) as { guid: string }[]).map((r) => r.guid))
   : new Set<string>();
  for (const item of items.slice(0, maxPer)) {
   if (seen.has(item.guid)) continue;
   const raw = await extractRaw(item.title, item.content);
   const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
   const pub = isNaN(publishedAt.getTime()) ? new Date().toISOString() : publishedAt.toISOString();
   // Record the post FIRST (idempotent) so a mid-post failure doesn't reprocess it forever.
   await sql`INSERT INTO substack_posts (guid, source_name, url, title, published_at) VALUES (${item.guid}, ${name}, ${item.link}, ${item.title}, ${pub}) ON CONFLICT (guid) DO NOTHING`.catch(() => {});
   posts++;
   const seenSeg = new Set<string>();
   for (const rm of raw) {
    const c = canonicalize(rm, brandRef, buckets);
    if (!c) continue;
    const key = `${c.type}:${c.value}`;
    if (seenSeg.has(key)) continue; // one mention per segment per post (a post is one "vote")
    seenSeg.add(key);
    const dir = ["emerging", "rising", "fading", "neutral"].includes(rm.direction || "") ? rm.direction : "neutral";
    await sql`INSERT INTO culture_mentions (post_guid, source_name, segment_type, segment_value, direction, quote, published_at)
     VALUES (${item.guid}, ${name}, ${c.type}, ${c.value}, ${dir}, ${item.title.slice(0, 200)}, ${pub})`.catch(() => {});
    mentions++;
   }
  }
  await sql`UPDATE substack_sources SET last_fetched_at = NOW() WHERE feed_url = ${src.feedUrl}`.catch(() => {});
 }
 return { sources: enabled.length, posts, mentions };
}

// ── The weekly consensus read ────────────────────────────────────────────────
export type ConsensusPick = {
 segmentType: SegmentType;
 segmentValue: string;
 writers: number;        // distinct publications calling it THIS window (the consensus strength)
 writersPrior: number;
 mentions: number;
 momentum: "new" | "up" | "steady" | "down";
 direction: string | null;
 quotes: string[];
};

export async function getSubstackConsensus(windowDays = 7, limit = 20): Promise<ConsensusPick[]> {
 await ensureTables();
 const sql = db();
 const now = Date.now();
 const curStart = new Date(now - windowDays * 86_400_000).toISOString();
 const priorStart = new Date(now - 2 * windowDays * 86_400_000).toISOString();
 const rows = (await sql`
  SELECT segment_type, segment_value,
   COUNT(DISTINCT source_name) FILTER (WHERE published_at >= ${curStart})::int AS writers_cur,
   COUNT(DISTINCT source_name) FILTER (WHERE published_at >= ${priorStart} AND published_at < ${curStart})::int AS writers_prior,
   COUNT(*) FILTER (WHERE published_at >= ${curStart})::int AS mentions_cur,
   mode() WITHIN GROUP (ORDER BY direction) AS direction,
   (array_agg(DISTINCT quote) FILTER (WHERE published_at >= ${curStart} AND quote IS NOT NULL))[1:2] AS quotes
  FROM culture_mentions
  WHERE published_at >= ${priorStart}
  GROUP BY segment_type, segment_value
  HAVING COUNT(DISTINCT source_name) FILTER (WHERE published_at >= ${curStart}) >= ${CONSENSUS_MIN_WRITERS}
  ORDER BY writers_cur DESC, mentions_cur DESC
  LIMIT ${limit}
 `.catch(() => [])) as {
  segment_type: SegmentType; segment_value: string; writers_cur: number; writers_prior: number; mentions_cur: number; direction: string | null; quotes: string[] | null;
 }[];
 return rows.map((r) => {
  const momentum: ConsensusPick["momentum"] = r.writers_prior === 0 ? "new" : r.writers_cur > r.writers_prior ? "up" : r.writers_cur < r.writers_prior ? "down" : "steady";
  return {
   segmentType: r.segment_type, segmentValue: r.segment_value,
   writers: r.writers_cur, writersPrior: r.writers_prior, mentions: r.mentions_cur,
   momentum, direction: r.direction, quotes: (r.quotes ?? []).filter(Boolean),
  };
 });
}

// ── Feedback loop: did the writers' consensus LEAD real VYA demand? ───────────
// Both the consensus and market_metrics map to the SAME segments, so we can check whether a trend
// the writers converged on `leadDays` ago went on to rise in actual VYA demand. That hit rate turns
// "writers are talking about X" into a CALIBRATED early signal. Only the shared segments (brand /
// category / era / color) can be scored — `style` has no demand counterpart. Needs weeks of history.
export type ScorecardEntry = { segmentType: string; segmentValue: string; writersThen: number; demandThen: number | null; demandNow: number | null; demandTrendNow: string | null; led: boolean };
export type Scorecard = { leadDays: number; evaluated: number; hits: number; hitRate: number | null; note?: string; entries: ScorecardEntry[] };

export async function getConsensusScorecard(leadDays = 21, windowDays = 7): Promise<Scorecard> {
 await ensureTables();
 const sql = db();
 const now = Date.now();
 const thenEnd = new Date(now - leadDays * 86_400_000).toISOString();
 const thenStart = new Date(now - (leadDays + windowDays) * 86_400_000).toISOString();
 const picks = (await sql`
  SELECT segment_type, segment_value, COUNT(DISTINCT source_name)::int AS writers
  FROM culture_mentions
  WHERE published_at >= ${thenStart} AND published_at < ${thenEnd} AND segment_type IN ('brand','category','era','color')
  GROUP BY segment_type, segment_value
  HAVING COUNT(DISTINCT source_name) >= ${CONSENSUS_MIN_WRITERS}
 `.catch(() => [])) as { segment_type: string; segment_value: string; writers: number }[];
 if (!picks.length) {
  return { leadDays, evaluated: 0, hits: 0, hitRate: null, note: "Not enough consensus history yet — the scorecard fills in after a few weekly runs.", entries: [] };
 }
 const entries: ScorecardEntry[] = [];
 for (const p of picks) {
  const nowRow = (await sql`SELECT demand_index, demand_trend FROM market_metrics WHERE segment_type = ${p.segment_type} AND segment_value = ${p.segment_value} AND window_key = '30d' ORDER BY as_of_date DESC LIMIT 1`.catch(() => [])) as { demand_index: number | null; demand_trend: string | null }[];
  const thenRow = (await sql`SELECT demand_index FROM market_metrics WHERE segment_type = ${p.segment_type} AND segment_value = ${p.segment_value} AND window_key = '30d' AND as_of_date <= ${thenEnd}::date ORDER BY as_of_date DESC LIMIT 1`.catch(() => [])) as { demand_index: number | null }[];
  const demandNow = nowRow[0]?.demand_index ?? null;
  const demandThen = thenRow[0]?.demand_index ?? null;
  const demandTrendNow = nowRow[0]?.demand_trend ?? null;
  // A "hit": demand rose since the consensus called it (or is currently rising if we lack a baseline).
  const led = demandNow != null && demandThen != null ? demandNow > demandThen : demandTrendNow === "rising";
  entries.push({ segmentType: p.segment_type, segmentValue: p.segment_value, writersThen: p.writers, demandThen, demandNow, demandTrendNow, led });
 }
 entries.sort((a, b) => b.writersThen - a.writersThen);
 const evaluated = entries.filter((e) => e.demandNow != null).length;
 const hits = entries.filter((e) => e.led).length;
 return { leadDays, evaluated, hits, hitRate: evaluated ? Math.round((hits / evaluated) * 100) : null, entries };
}
