import { neon } from "@neondatabase/serverless";

// RN (Registered Identification Number) → brand. The RN is the US FTC number printed on garment
// labels; it maps to the company that made/imported the piece and is often legible even when the
// brand name has faded — the single most reliable brand key on a vintage tag.
//
// We resolve from a LEARNED table (never fabricated mappings): it's seeded/grown two ways —
//  1. the feedback loop: when a seller confirms/corrects a brand on an item whose tag had an RN,
//     we record RN → that brand (learnRnBrand), so the platform gets smarter about its own inventory;
//  2. an optional live FTC lookup (gated by RN_FTC_LOOKUP=true), cached back into the table.
// If nothing resolves, we return null and the caller falls back to the printed brand name / Lens.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensure() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS rn_brands (
  rn TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'learned',
  hits INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

const cleanRn = (rn: string): string => String(rn || "").replace(/[^0-9]/g, "");

/** Record that an RN belongs to a brand — from a seller-confirmed listing. Confirmed wins over a
 *  prior guess; repeated confirmations bump `hits` so the strongest signal sticks. */
export async function learnRnBrand(rn: string, brand: string, source = "seller"): Promise<void> {
 const r = cleanRn(rn), b = (brand || "").trim();
 if (r.length < 4 || r.length > 8 || !b) return;
 try {
 await ensure();
 await db()`
  INSERT INTO rn_brands (rn, brand, source, hits, updated_at)
  VALUES (${r}, ${b}, ${source}, 1, now())
  ON CONFLICT (rn) DO UPDATE SET
   brand = CASE WHEN ${source} = 'seller' THEN EXCLUDED.brand ELSE rn_brands.brand END,
   hits = rn_brands.hits + 1,
   updated_at = now()
 `;
 } catch { /* best effort */ }
}

/** Best-effort live FTC RN lookup, cached into rn_brands. Gated + defensive: any failure → null,
 *  and the HTML scrape must be verified against rn.ftc.gov before trusting it in prod. */
async function ftcLookup(rn: string): Promise<string | null> {
 if (process.env.RN_FTC_LOOKUP !== "true") return null;
 try {
 const res = await fetch(`https://rn.ftc.gov/Account/BasicSearch?RN=${encodeURIComponent(rn)}`, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0" } });
 if (!res.ok) return null;
 const html = await res.text();
 // The results page lists the business name; parse it defensively (structure may change).
 const m = html.match(/Business\s*Name[^<]*<[^>]*>\s*([^<]{2,80})/i) || html.match(/company["'>\s:]+([A-Z][A-Za-z0-9&.,'\- ]{2,60})/);
 const name = m?.[1]?.trim();
 return name && !/no results/i.test(name) ? name : null;
 } catch {
 return null;
 }
}

/** Resolve an RN to a brand: learned table first, then optional FTC (cached). null if unknown. */
export async function rnToBrand(rn: string | null | undefined): Promise<string | null> {
 const r = cleanRn(rn || "");
 if (r.length < 4 || r.length > 8) return null;
 try {
 await ensure();
 const rows = (await db()`SELECT brand FROM rn_brands WHERE rn = ${r} LIMIT 1`) as { brand: string }[];
 if (rows.length) return rows[0].brand;
 } catch { /* fall through to FTC */ }
 const ftc = await ftcLookup(r);
 if (ftc) { await learnRnBrand(r, ftc, "ftc").catch(() => {}); return ftc; }
 return null;
}
