/**
 * Create the seller records that three captured stores are missing — and report what they hold.
 *
 *   # look, change nothing (default):
 *   node --env-file=.env.local --experimental-strip-types scripts/fix-missing-sellers.mts
 *
 *   # actually write:
 *   node --env-file=.env.local --experimental-strip-types scripts/fix-missing-sellers.mts --apply
 *
 * WHY: Plan B resolves a store from its host — `loved-again.vyasites.test` → slug `loved-again` →
 * getSellerBySlug('loved-again'). ascensio-demo, lamash and loved-again have captured pages but NO
 * seller row, so every cart call answers "Unknown store."/"Cart Error", and the serve path skips
 * live-inventory injection entirely (route.ts only swaps grids `if (seller)`), which is why their
 * product cards still link to the seller's real website instead of VYA.
 *
 * The insert is the same one the platform already uses (getOrCreateSeller → ON CONFLICT DO NOTHING),
 * so running it twice is harmless.
 *
 * EMAIL is deliberately left blank rather than invented. It is NOT NULL, so it is written as an
 * empty string, and every send site guards on `if (sellerEmail)` — so a blank address silently sends
 * nothing, whereas a plausible-looking wrong address would send a real seller's sale notifications to
 * somebody else. Any mailto: found in the captures is REPORTED for you to set deliberately.
 *
 * Read-only unless --apply is passed.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
 console.error("DATABASE_URL (or POSTGRES_URL) is not set. Run with: node --env-file=.env.local …");
 process.exit(1);
}
const sql = neon(url);
const APPLY = process.argv.includes("--apply");

/** The stores the slug audit found with captures but no seller. */
const TARGETS = ["ascensio-demo", "lamash", "loved-again"];

/**
 * Display-name overrides, as `--name slug="Real Name"`.
 *
 * The name is scraped from the store's own <title>, which carries whatever their old platform put
 * there — Lamash's reads "Lamash store" because the capture came from lamash-store.myshopify.com,
 * while their actual wordmark is just LAMASH. This is the shopper-facing store name, so it is worth
 * getting right at creation rather than renaming afterwards.
 */
const NAME_OVERRIDES = new Map<string, string>();
for (let i = 0; i < process.argv.length; i++) {
 if (process.argv[i] !== "--name") continue;
 const eq = (process.argv[i + 1] || "").indexOf("=");
 if (eq > 0) NAME_OVERRIDES.set(process.argv[i + 1].slice(0, eq), process.argv[i + 1].slice(eq + 1));
}

/** A human store name from the store's own captured markup, falling back to the slug. */
function nameFrom(html: string, slug: string): string {
 const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
 const title = html.match(/<title[^>]*>([^<]{2,80})<\/title>/i)?.[1];
 // A <title> is usually "Page — Store"; the store is the last segment.
 const fromTitle = title ? title.split(/[|–—·]/).map((s) => s.trim()).filter(Boolean).pop() : null;
 const picked = (og || fromTitle || "").replace(/\s+/g, " ").trim();
 if (picked && picked.length <= 60) return picked;
 return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Contact addresses the store published, so a real one can be set deliberately afterwards. */
function mailtos(html: string): string[] {
 const found = new Set<string>();
 for (const m of html.matchAll(/mailto:([^"'?\s>]+@[^"'?\s>]+)/gi)) found.add(m[1].toLowerCase());
 return [...found].slice(0, 4);
}

async function main() {
 console.log(APPLY ? "\n=== APPLYING — this writes to the database ===\n" : "\n=== DRY RUN — nothing will be written (pass --apply to write) ===\n");

 for (const slug of TARGETS) {
  const existing = (await sql`SELECT id, name, email FROM sellers WHERE slug = ${slug} LIMIT 1`) as { id: string; name: string; email: string }[];
  const pages = (await sql`SELECT path FROM site_captures WHERE store_slug = ${slug} ORDER BY path`) as { path: string }[];
  const origin = (await sql`SELECT source_url FROM site_captures WHERE store_slug = ${slug} AND source_url IS NOT NULL LIMIT 1`) as { source_url: string }[];

  console.log(`\n${"=".repeat(100)}\n${slug}  —  ${pages.length} captured pages`);
  if (origin[0]) console.log(`  imported from: ${origin[0].source_url}`);

  if (existing[0]) {
   console.log(`  seller: ALREADY EXISTS (${existing[0].name}) — nothing to do`);
  } else {
   // Name and contact come from the store's own home page.
   const home = (await sql`
    SELECT left(html, 200000) AS html FROM site_captures
    WHERE store_slug = ${slug} ORDER BY length(path) ASC LIMIT 1
   `) as { html: string }[];
   const html = home[0]?.html || "";
   const scraped = nameFrom(html, slug);
   const name = NAME_OVERRIDES.get(slug) ?? scraped;
   const emails = mailtos(html);

   console.log(`  seller: MISSING → would create { slug: "${slug}", name: "${name}", email: "" }`);
   if (NAME_OVERRIDES.has(slug)) console.log(`  name overridden on the command line (scraped from the capture: "${scraped}")`);
   if (emails.length) console.log(`  contact addresses found in the capture (set one deliberately): ${emails.join(", ")}`);
   else console.log(`  no mailto: found in the capture — set the seller's email in the portal afterwards`);

   if (APPLY) {
    await sql`INSERT INTO sellers (slug, name, email) VALUES (${slug}, ${name}, ${""}) ON CONFLICT (slug) DO NOTHING`;
    console.log(`  → created.`);
   }
  }

  // ── Inventory ────────────────────────────────────────────────────────────────────────────────
  const seller = (await sql`SELECT id FROM sellers WHERE slug = ${slug} LIMIT 1`) as { id: string }[];
  if (seller[0]) {
   const byStatus = (await sql`
    SELECT status, COUNT(*)::int AS n FROM items WHERE seller_id = ${seller[0].id} GROUP BY status ORDER BY n DESC
   `) as { status: string; n: number }[];
   const total = byStatus.reduce((n, r) => n + r.n, 0);
   console.log(`\n  INVENTORY ON VYA: ${total} item(s)${total ? ` — ${byStatus.map((r) => `${r.n} ${r.status}`).join(", ")}` : ""}`);
   if (total) {
    const sample = (await sql`
     SELECT title, price_cents, currency, status, source_id FROM items
     WHERE seller_id = ${seller[0].id} ORDER BY created_at DESC LIMIT 5
    `) as { title: string; price_cents: number; currency: string; status: string; source_id: string | null }[];
    for (const it of sample) {
     console.log(`    • ${it.title.slice(0, 52).padEnd(54)} ${((it.price_cents || 0) / 100).toFixed(2)} ${it.currency}  ${it.status}  /products/${it.source_id || "?"}`);
    }
   } else {
    // A seller with no items has nothing to put in the live grids, so the captured (frozen) cards
    // stay on the page — the seller record alone does not finish the import.
    console.log(`    (no items — the storefront will render, but its product grids have nothing live to show)`);
   }
  } else {
   console.log(`\n  INVENTORY ON VYA: n/a — no seller record yet (re-run with --apply)`);
  }

  // ── Pages ────────────────────────────────────────────────────────────────────────────────────
  const host = `${slug}.vyasites.test:3333`;
  console.log(`\n  PAGES (${pages.length}) — open at http://${host}`);
  const shown = pages.slice(0, 12);
  for (const p of shown) console.log(`    http://${host}${p.path}`);
  if (pages.length > shown.length) console.log(`    …and ${pages.length - shown.length} more`);
  console.log(`  cart page captured: ${pages.some((p) => /^\/cart\/?$/.test(p.path)) ? "yes" : "NO — served by the fallback cart page"}`);
 }

 console.log(`\n${"=".repeat(100)}`);
 if (!APPLY) console.log("\nDry run — nothing was written. Re-run with --apply to create the seller records.\n");
 else console.log("\nDone. Set each seller's email in the portal before they take real orders.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
