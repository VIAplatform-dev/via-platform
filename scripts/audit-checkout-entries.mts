/**
 * Phase 0 — what checkout entry points do our captured storefronts ACTUALLY have?
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/audit-checkout-entries.mts
 *
 * Before designing a route table that intercepts "the Checkout button", we should know what that
 * button really is on the stores we host — not what Shopify's and Squarespace's documentation say
 * it usually is. This reads the captures already in the database and reports, per store:
 *
 *   • which platform the captured HTML says it is
 *   • every element that could start a payment, by kind
 *   • the raw markup of the checkout control on its cart page, so we can see the real thing
 *
 * READ-ONLY. It runs SELECTs and writes nothing, touches no network, and calls no Stripe.
 *
 * Counting happens in SQL wherever possible: a capture row is a whole HTML page and some are
 * megabytes, so pulling every page into Node to regex it would move hundreds of MB for numbers
 * Postgres can produce in place. Only the cart pages come back in full, and only one per store.
 */
import { neon } from "@neondatabase/serverless";
import * as cheerio from "cheerio";
import { detectPlatform } from "../app/lib/import-engine/detect.ts";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
 console.error("DATABASE_URL (or POSTGRES_URL) is not set. Run with: node --env-file=.env.local …");
 process.exit(1);
}
const sql = neon(url);

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The signatures we're looking for, each with what it would MEAN for the design.
 *
 * `like` is a SQL ILIKE pattern rather than a regex so Postgres can scan the column directly.
 * These are deliberately broad — a false positive costs a line of output, while a miss is the
 * exact failure mode this audit exists to prevent.
 */
const SIGNATURES: { key: string; like: string; means: string }[] = [
 { key: "shopify:name=checkout", like: '%name="checkout"%', means: "Shopify cart/drawer Checkout submit button" },
 { key: "shopify:form-action-cart", like: '%action="/cart"%', means: "the form that button submits (POST /cart)" },
 { key: "shopify:cart-permalink", like: '%/cart/%:1%', means: "a /cart/{variant}:1 buy-now permalink" },
 { key: "shopify:checkouts-path", like: "%/checkouts/%", means: "a link into Shopify's hosted checkout" },
 { key: "shopify:dynamic-checkout", like: "%shopify-payment-button%", means: "Shop Pay / dynamic checkout (should be stripped)" },
 { key: "sqs:goto-checkout", like: "%goto-checkout%", means: "Squarespace's checkout redirector" },
 { key: "sqs:cart-root", like: "%sqs-cart%", means: "Squarespace's client-rendered cart mount" },
 { key: "generic:href-checkout", like: '%href="/checkout%', means: "a plain link to /checkout" },
 { key: "bigcartel:marker", like: "%bigcartel%", means: "Big Cartel store" },
 { key: "wix:marker", like: "%wixstores%", means: "Wix store" },
 { key: "vya:already-rewired", like: "%data-vya-checkout%", means: "ALREADY repointed at VYA by injectCartPage" },
];

async function main() {
 const stores = (await sql`
  SELECT store_slug, COUNT(*)::int AS pages
  FROM site_captures GROUP BY store_slug ORDER BY store_slug
 `) as { store_slug: string; pages: number }[];

 if (!stores.length) {
  console.log("No captures in this database.");
  return;
 }

 console.log(`\n${stores.length} captured stores, ${stores.reduce((n, s) => n + s.pages, 0)} pages total.\n`);

 // Every signature counted in ONE pass over the table.
 //
 // The obvious shape — a query per signature — is eleven sequential scans of every captured page,
 // and an ILIKE with a leading wildcard cannot use an index, so each one reads the full HTML of all
 // 2000+ pages. That is gigabytes moved eleven times. Instead: one scan, with each signature as a
 // conditional SUM, so Postgres tests all eleven while the row is already in hand.
 const cols = SIGNATURES.map((s, i) => `SUM(CASE WHEN html ILIKE $${i + 1} THEN 1 ELSE 0 END)::int AS s${i}`).join(",\n   ");
 const rows = (await sql.query(
  `SELECT store_slug,\n   ${cols}\n  FROM site_captures GROUP BY store_slug`,
  SIGNATURES.map((s) => s.like),
 )) as Record<string, any>[];

 const hits = new Map<string, Map<string, number>>(); // slug → key → pages matching
 for (const r of rows) {
  const m = new Map<string, number>();
  SIGNATURES.forEach((sig, i) => { if (r[`s${i}`] > 0) m.set(sig.key, r[`s${i}`]); });
  hits.set(r.store_slug, m);
 }

 // Platform, from the store's own captured home page.
 const platform = new Map<string, string>();
 for (const s of stores) {
  // Only the first stretch of the page: every platform marker detectPlatform looks for (asset
  // hosts, theme globals, generator meta) is in the head or the opening body, and pulling whole
  // multi-megabyte pages back just to read them is the slowest thing this script could do.
  const row = (await sql`
   SELECT left(html, 300000) AS html FROM site_captures
   WHERE store_slug = ${s.store_slug} ORDER BY length(path) ASC LIMIT 1
  `) as { html: string }[];
  platform.set(s.store_slug, row[0] ? detectPlatform(row[0].html).platform || "unknown" : "no-pages");
 }

 // ── Per store ──────────────────────────────────────────────────────────────────────────────────
 console.log("STORE".padEnd(30), "PLATFORM".padEnd(13), "PAGES", " SIGNATURES FOUND");
 console.log("-".repeat(120));
 for (const s of stores) {
  const h = hits.get(s.store_slug) || new Map();
  const found = SIGNATURES.filter((x) => h.has(x.key)).map((x) => `${x.key}(${h.get(x.key)})`);
  console.log(
   s.store_slug.slice(0, 29).padEnd(30),
   (platform.get(s.store_slug) || "?").padEnd(13),
   String(s.pages).padStart(5),
   " " + (found.join("  ") || "— none —"),
  );
 }

 // ── Totals: how many STORES (not pages) each signature applies to ──────────────────────────────
 console.log(`\n\nHOW MANY STORES HAVE EACH SIGNATURE (of ${stores.length})\n${"-".repeat(120)}`);
 for (const sig of SIGNATURES) {
  const n = stores.filter((s) => hits.get(s.store_slug)?.has(sig.key)).length;
  const bar = "█".repeat(Math.round((n / stores.length) * 40));
  console.log(`${sig.key.padEnd(28)} ${String(n).padStart(3)}  ${bar.padEnd(41)} ${sig.means}`);
 }

 // Platform spread — tells us whether a Wix/Big Cartel branch would serve anyone at all.
 const byPlatform = new Map<string, number>();
 for (const p of platform.values()) byPlatform.set(p, (byPlatform.get(p) || 0) + 1);
 console.log(`\n\nPLATFORM SPREAD\n${"-".repeat(120)}`);
 for (const [p, n] of [...byPlatform].sort((a, b) => b[1] - a[1])) console.log(`${p.padEnd(20)} ${n}`);

 // Stores with NO checkout signature at all — the ones a route table would silently fail.
 const CHECKOUTY = SIGNATURES.filter((s) => !s.key.startsWith("bigcartel") && !s.key.startsWith("wix") && s.key !== "vya:already-rewired");
 const blind = stores.filter((s) => !CHECKOUTY.some((sig) => hits.get(s.store_slug)?.has(sig.key)));
 console.log(`\n\nSTORES WITH NO RECOGNISED CHECKOUT CONTROL: ${blind.length}\n${"-".repeat(120)}`);
 console.log(blind.length ? blind.map((s) => `${s.store_slug} (${platform.get(s.store_slug)})`).join("\n") : "none — every store has at least one");

 // ── The real markup, from each store's cart page ────────────────────────────────────────────────
 // This is the part a route table cannot be designed without: what the button literally is.
 console.log(`\n\nTHE ACTUAL CHECKOUT CONTROL ON EACH CART PAGE\n${"-".repeat(120)}`);
 for (const s of stores) {
  const row = (await sql`
   SELECT html FROM site_captures
   WHERE store_slug = ${s.store_slug} AND path IN ('/cart', '/cart/') LIMIT 1
  `) as { html: string }[];
  if (!row[0]) { console.log(`\n${s.store_slug}: no /cart page captured`); continue; }

  const $ = cheerio.load(row[0].html);
  const controls = $('[name="checkout"], [class*="checkout"], a[href*="checkout"], form[action*="/cart"]').toArray();
  console.log(`\n${s.store_slug} (${platform.get(s.store_slug)}) — ${controls.length} candidate control(s)`);
  for (const el of controls.slice(0, 4)) {
   const $el = $(el);
   const tag = (el as any).tagName;
   const attrs = Object.entries((el as any).attribs || {})
    .filter(([k]) => ["name", "href", "action", "method", "type", "form", "class", "disabled"].includes(k))
    .map(([k, v]) => `${k}="${String(v).slice(0, 60)}"`).join(" ");
   console.log(`   <${tag} ${attrs}>  text: ${JSON.stringify(($el.text() || "").replace(/\s+/g, " ").trim().slice(0, 40))}`);
  }
 }

 console.log("\nDone. Read-only — nothing was written.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
