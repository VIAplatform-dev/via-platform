import { neon } from "@neondatabase/serverless";

// Instagram buzz: a LEADING cultural-momentum signal for the Trends tab. Social heat runs ahead of
// resale demand (an archival label blows up on IG weeks before eBay volume moves), so this catches
// surges the price/search signals miss. Persisted daily like the other trend snapshots.
//
// Reality of the Instagram Graph API (be honest about the limits):
//   • It does NOT expose a hashtag's total post count. So "buzz" = summed engagement (likes +
//     comments) across the tag's TOP media. A real proxy for how much traction the tag is getting.
//   • Hashtag queries are capped at 30 UNIQUE hashtags per 7 days per user. Re-querying the same
//     tag daily counts once, so we track a stable top-N set (IG_MAX_BRANDS) to stay well under it.
//   • Needs a Meta app + a Business/Creator IG account: IG_ACCESS_TOKEN + IG_BUSINESS_ACCOUNT_ID.
// Fully dormant (no calls) until those env vars are set.

const IG_API = "https://graph.facebook.com/v21.0";
const IG_MAX_BRANDS = 12; // unique hashtags/week ceiling is 30. Stay well under it

export function igConfigured(): boolean {
 return Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_BUSINESS_ACCOUNT_ID);
}

function tdb() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

// "Dolce & Gabbana" → "dolcegabbana"; IG hashtags are lowercase alphanumerics only.
function toHashtag(brand: string): string {
 return brand.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function ig(path: string, params: Record<string, string>): Promise<any | null> {
 const token = process.env.IG_ACCESS_TOKEN;
 if (!token) return null;
 const url = new URL(`${IG_API}/${path}`);
 url.searchParams.set("access_token", token);
 for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
 try {
 const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
 if (!res.ok) return null;
 return await res.json();
 } catch { return null; }
}

export type IgBuzz = { brand: string; buzzScore: number; sampleCount: number; momentumPct: number | null };

async function hashtagBuzz(brand: string): Promise<{ buzzScore: number; sampleCount: number } | null> {
 const userId = process.env.IG_BUSINESS_ACCOUNT_ID!;
 const tag = toHashtag(brand);
 if (!tag) return null;
 const search = await ig("ig_hashtag_search", { user_id: userId, q: tag });
 const hashtagId = search?.data?.[0]?.id;
 if (!hashtagId) return null;
 const media = await ig(`${hashtagId}/top_media`, { user_id: userId, fields: "like_count,comments_count", limit: "25" });
 const rows: any[] = media?.data ?? [];
 if (!rows.length) return null;
 const buzzScore = rows.reduce((s, m) => s + (Number(m.like_count) || 0) + (Number(m.comments_count) || 0), 0);
 return { buzzScore, sampleCount: rows.length };
}

let _ready = false;
async function ensureTable(sql: ReturnType<typeof tdb>) {
 if (_ready) return;
 await sql`CREATE TABLE IF NOT EXISTS instagram_buzz_snapshots (id BIGSERIAL PRIMARY KEY, brand TEXT NOT NULL, buzz_score BIGINT NOT NULL, sample_count INT, captured_at TIMESTAMPTZ NOT NULL DEFAULT now())`.catch(() => {});
 await sql`CREATE INDEX IF NOT EXISTS idx_ig_buzz_brand_ts ON instagram_buzz_snapshots (lower(brand), captured_at DESC)`.catch(() => {});
 _ready = true;
}

// CAPTURE (called by the daily cron): top-N brands only, to respect the 30-hashtag/7-day cap.
export async function captureInstagramBuzz(brands: string[]): Promise<number> {
 const list = [...new Set(brands.map((b) => b.trim()).filter(Boolean))].slice(0, IG_MAX_BRANDS);
 if (!igConfigured() || !list.length) return 0;
 const sql = tdb();
 await ensureTable(sql);
 let saved = 0;
 for (const brand of list) {
 const b = await hashtagBuzz(brand).catch(() => null);
 if (b) {
 await sql`INSERT INTO instagram_buzz_snapshots (brand, buzz_score, sample_count) VALUES (${brand}, ${b.buzzScore}, ${b.sampleCount})`.catch(() => {});
 saved++;
 }
 }
 return saved;
}

// READ (called by the Trends route): latest buzz per brand + momentum vs ~a week ago.
export async function getInstagramBuzz(brands: string[]): Promise<IgBuzz[]> {
 const list = [...new Set(brands.map((b) => b.trim()).filter(Boolean))];
 if (!list.length) return [];
 const sql = tdb();
 const out: IgBuzz[] = [];
 for (const brand of list) {
 const latest = (await sql`SELECT buzz_score, sample_count FROM instagram_buzz_snapshots WHERE lower(brand) = lower(${brand}) ORDER BY captured_at DESC LIMIT 1`.catch(() => [])) as { buzz_score: number; sample_count: number | null }[];
 const l = latest[0];
 if (!l) continue;
 const prior = (await sql`SELECT buzz_score FROM instagram_buzz_snapshots WHERE lower(brand) = lower(${brand}) AND captured_at <= now() - interval '6 days' ORDER BY captured_at DESC LIMIT 1`.catch(() => [])) as { buzz_score: number }[];
 const p = prior[0];
 const momentumPct = p && Number(p.buzz_score) > 0 ? Math.round(((Number(l.buzz_score) - Number(p.buzz_score)) / Number(p.buzz_score)) * 100) : null;
 out.push({ brand, buzzScore: Number(l.buzz_score), sampleCount: l.sample_count ?? 0, momentumPct });
 }
 return out;
}
