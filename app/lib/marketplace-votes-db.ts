import { neon } from "@neondatabase/serverless";
import { PLATFORMS, effectiveMode } from "./cross-listing-platforms.ts";
import { normaliseSuggestion, matchKnownPlatform, rankSuggestions } from "./marketplace-votes.ts";

// Where the votes live. One row per shop per channel, so a shop counts once however many times she
// presses the button. See marketplace-votes.ts for the counting, which is pure and tested.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS marketplace_votes (
  store_slug TEXT NOT NULL,
  platform_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_slug, platform_key)
 )`;
 // Write-ins: the channel she wants that isn't on the list, which is the answer we could not have
 // guessed. One per shop per name, so pressing send twice doesn't double her.
 await sql`CREATE TABLE IF NOT EXISTS marketplace_suggestions (
  store_slug TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_slug, suggestion)
 )`;
 ensured = true;
}

/** The channels a shop may vote for: the ones that aren't built yet. */
export function votablePlatforms(): Array<{ key: string; name: string }> {
 return PLATFORMS.filter((p) => effectiveMode(p) === "soon").map((p) => ({ key: p.key, name: p.name }));
}

export const isVotable = (key: string): boolean => votablePlatforms().some((p) => p.key === key);

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Every channel's vote count, and which ones this shop has asked for. */
export async function getVotes(storeSlug: string): Promise<{ counts: Record<string, number>; mine: string[] }> {
 await ensureTable();
 const sql = db();
 const [all, mine] = await Promise.all([
  sql`SELECT platform_key, COUNT(*)::int AS n FROM marketplace_votes GROUP BY platform_key`.catch(() => []),
  sql`SELECT platform_key FROM marketplace_votes WHERE store_slug = ${storeSlug}`.catch(() => []),
 ]);
 const counts: Record<string, number> = {};
 for (const r of all as any[]) counts[r.platform_key] = r.n;
 return { counts, mine: (mine as any[]).map((r) => r.platform_key) };
}

/**
 * Turn a shop's vote on or off. Returns whether she now wants it.
 *
 * Idempotent in both directions: the primary key makes a second vote a no-op rather than a second
 * row, so a double-tapped button cannot inflate a channel's count.
 */
export async function toggleVote(storeSlug: string, platformKey: string): Promise<boolean> {
 await ensureTable();
 if (!isVotable(platformKey)) throw new Error("That channel isn't up for a vote.");
 const sql = db();
 const existing = (await sql`SELECT 1 FROM marketplace_votes WHERE store_slug = ${storeSlug} AND platform_key = ${platformKey}`.catch(() => [])) as any[];
 if (existing.length) {
  await sql`DELETE FROM marketplace_votes WHERE store_slug = ${storeSlug} AND platform_key = ${platformKey}`;
  return false;
 }
 await sql`INSERT INTO marketplace_votes (store_slug, platform_key) VALUES (${storeSlug}, ${platformKey})
  ON CONFLICT (store_slug, platform_key) DO NOTHING`;
 return true;
}

/**
 * A write-in. Returns the platform key when what she typed is really one of ours, so it counts as a
 * vote for that channel instead of quietly starting a second tally of the same demand.
 */
export async function suggest(storeSlug: string, raw: unknown): Promise<{ ok: boolean; matchedKey?: string }> {
 await ensureTable();
 const name = normaliseSuggestion(raw);
 if (!name) return { ok: false };
 const matched = matchKnownPlatform(name, votablePlatforms());
 if (matched) {
  await db()`INSERT INTO marketplace_votes (store_slug, platform_key) VALUES (${storeSlug}, ${matched})
   ON CONFLICT (store_slug, platform_key) DO NOTHING`;
  return { ok: true, matchedKey: matched };
 }
 await db()`INSERT INTO marketplace_suggestions (store_slug, suggestion) VALUES (${storeSlug}, ${name})
  ON CONFLICT (store_slug, suggestion) DO NOTHING`;
 return { ok: true };
}

/** Which shops asked for each channel. VYA's own view: a count is a number, a list is a phone call. */
export async function votersByPlatform(): Promise<Record<string, string[]>> {
 await ensureTable();
 const rows = (await db()`SELECT store_slug, platform_key FROM marketplace_votes ORDER BY created_at`.catch(() => [])) as any[];
 const out: Record<string, string[]> = {};
 for (const r of rows) (out[r.platform_key] ??= []).push(r.store_slug);
 return out;
}

/** The write-ins, most-asked first. VYA's own view. */
export async function allSuggestions(): Promise<Array<{ name: string; count: number }>> {
 await ensureTable();
 const rows = (await db()`SELECT suggestion FROM marketplace_suggestions`.catch(() => [])) as any[];
 return rankSuggestions(rows.map((r) => ({ suggestion: r.suggestion })));
}
