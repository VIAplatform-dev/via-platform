/**
 * 1:1 parity between a hosted store and the seller's live site.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/parity-check.mts <slug> [--port 3348]
 *
 * Three layers, each a number, because "does it match?" has been answered "yes" all day by checks
 * that measured the wrong thing:
 *
 *   CATALOG  — every product the source publishes vs every item we hold; every collection's member
 *              count on the source vs ours. Read from the platform's own feeds, no browser.
 *   PAGES    — every path in the source's sitemap vs every path we captured.
 *   SHOPPER  — the homepage, the busiest collection and a product page, loaded on BOTH sites in the
 *              same browser at the same viewport: product titles in grid order, prices in order,
 *              nav labels, headings, image counts. Plus side-by-side screenshots, because the
 *              numbers have been wrong before when the picture was obviously not.
 *
 * Reads the seller's live site (public pages + feeds). Writes nothing to the database.
 */
import { chromium, type Browser } from "playwright";
import { neon } from "@neondatabase/serverless";
import { compareCollections, type SourceCollectionRead } from "../app/lib/collection-parity.ts";
import { pageShowsPrice } from "../app/lib/live-price.ts";
import { pagesGenuinelyMissing } from "../app/lib/locale-paths.ts";
import { DISMISS_OVERLAYS } from "../app/lib/plan-b/dismiss-overlays.ts";
import { classifyMissing, type FeedProduct } from "../app/lib/catalog-parity.ts";
import { VOLATILE_SELECTOR } from "../app/lib/parity-regions.ts";
import { productsFromLinks, sectionHeadings, COLLECT_PRODUCT_LINKS, type ProductLinkCandidate, type PageProduct } from "../app/lib/product-links.ts";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"))!;
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3348";
if (!slug) { console.error("usage: parity-check.mts <slug> [--port N]"); process.exit(2); }
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const OUT = path.join(".verify", slug); fs.mkdirSync(OUT, { recursive: true });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

const [home] = await sql`SELECT source_url FROM site_captures WHERE store_slug=${slug} AND path='/'` as { source_url: string }[];
if (!home) { console.log(`${slug}: no capture`); process.exit(1); }
const origin = new URL(home.source_url).origin;
const [seller] = await sql`SELECT id FROM sellers WHERE slug=${slug}` as { id: string }[];
const report: Record<string, unknown> = { slug, origin };

// ── CATALOG ──────────────────────────────────────────────────────────────────────────────────────
const isShopify = /shopify/i.test(await fetch(origin, { headers: UA, signal: AbortSignal.timeout(20000) }).then((r) => r.text()).catch(() => ""));
let catalog: Record<string, unknown> = { platform: isShopify ? "shopify" : "other" };
if (isShopify) {
 const feed: FeedProduct[] = [];
 for (let page = 1; page <= 12; page++) {
  const r = await fetch(`${origin}/products.json?limit=250&page=${page}`, { headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r?.ok) break;
  const j = JSON.parse((await r.text()).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")) as { products?: typeof feed };
  if (!j.products?.length) break;
  feed.push(...j.products);
  if (j.products.length < 250) break;
 }
 const ours = seller ? await sql`SELECT source_id, status FROM items WHERE seller_id=${seller.id} AND status IN ('active','sold')` as { source_id: string; status: string }[] : [];
 const ourHandles = new Set(ours.map((o) => o.source_id));
 const srcHandles = new Set(feed.map((p) => p.handle));
 // A piece with no price and nothing available (an archive display listing) is not sellable, so the
 // importer leaves it out on purpose; it is not "missing".
 const sellable = (p: (typeof feed)[number]) => p.variants.some((v) => Number(v.price) > 0 || v.available);
 // "Missing" now means what a shopper would mean: buyable today, photographed, and not on our copy.
 // Sold pieces and un-photographed pre-orders are reported separately — see catalog-parity.ts.
 const classified = classifyMissing(feed, ourHandles);
 const missingHere = classified.missing;
 // Only ACTIVE items can be wrongly "extra": the seller's feed drops sold pieces, we keep them marked sold.
 const extraHere = ours.filter((o) => o.source_id && o.status === "active" && !srcHandles.has(o.source_id));
 // availability parity: the source's available flag vs our status
 let availMismatch = 0;
 const byHandle = new Map(ours.map((o) => [o.source_id, o.status]));
 for (const p of feed) { const st = byHandle.get(p.handle); if (!st) continue; const srcAvail = p.variants.some((v) => v.available); if ((st === "active") !== srcAvail) availMismatch++; }
 // collections
 const cols: { handle: string; title: string }[] = await fetch(`${origin}/collections.json?limit=250`, { headers: UA, signal: AbortSignal.timeout(20000) }).then((r) => r.json()).then((j) => j.collections || []).catch(() => []);
 // Our membership as source_ids, not a count: only the pieces the seller still lists are comparable
 // with their feed (see app/lib/collection-parity.ts).
 const memberRows = seller ? await sql`SELECT c.slug, i.source_id, i.status FROM collections c JOIN item_collections ic ON ic.collection_id=c.id JOIN items i ON i.id=ic.item_id WHERE c.seller_id=${seller.id}` as { slug: string; source_id: string | null; status: string }[] : [];
 const ourCol = new Map<string, string[]>();
 for (const c of seller ? await sql`SELECT slug FROM collections WHERE seller_id=${seller.id}` as { slug: string }[] : []) ourCol.set(c.slug, []);
 // Which of our pieces are still for sale — a sold piece their feed dropped is expected, not drift.
 const ourActive = new Set<string>();
 for (const r of memberRows) {
  if (!r.source_id) continue;
  ourCol.get(r.slug)?.push(r.source_id);
  if (r.status === "active") ourActive.add(r.source_id);
 }
 const colReads: SourceCollectionRead[] = [];
 const COL_PAGES = 12; // 3000 pieces; below this a big "all" collection read back as truncated
 for (const c of cols.slice(0, 40)) {
  let n = 0, ok = false, truncated = false;
  // The handles, not just the total: sellers' feeds disagree about whether a sold piece stays in a
  // collection, so only comparing the pieces themselves is right for all of them.
  const handles: string[] = [];
  for (let page = 1; page <= COL_PAGES; page++) {
   const r = await fetch(`${origin}/collections/${c.handle}/products.json?limit=250&page=${page}`, { headers: UA, signal: AbortSignal.timeout(15000) }).catch(() => null);
   if (!r?.ok) break; // a failed/throttled read leaves ok=false → not evidence of an empty collection
   const j = JSON.parse((await r.text()).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")) as { products?: { handle?: string }[] };
   ok = true;
   const k = j.products?.length || 0; n += k;
   for (const p of j.products || []) if (p.handle) handles.push(p.handle);
   if (k < 250) break;
   if (page === COL_PAGES) truncated = true;
  }
  colReads.push({ handle: c.handle, count: n, unread: !ok, truncated, ...(ok ? { handles } : {}) });
 }
 // What our OWN page serves for each rail. Every check above compares the database with the
 // seller's site; none of them looks at the page a shopper gets, which is how a 94-piece rail went
 // out serving 401. The page states its own size (stampCollectionSize); we read it back.
 const servedCounts = new Map<string, number | null>();
 const servedSource = new Map<string, string | null>();
 for (const handle of ourCol.keys()) {
  const r = await fetch(`http://${slug}.vyasites.test:${port}/collections/${handle}`, { headers: UA, signal: AbortSignal.timeout(30000) }).catch(() => null);
  const html = r?.ok ? await r.text().catch(() => "") : "";
  const m = /<meta[^>]+name=["']vya:collection-size["'][^>]+content=["'](\d+)["']/i.exec(html);
  const src = /<meta[^>]+name=["']vya:collection-source["'][^>]+content=["']([a-z]+)["']/i.exec(html);
  servedCounts.set(handle, m ? Number(m[1]) : null);
  servedSource.set(handle, src ? src[1] : null);
 }
 // Pieces the seller shows but does not sell — same rule the catalogue comparison already applies
 // via `sellable`. Without it, blummier's two £0 archive display pieces read as missing from every
 // collection they appear in.
 const unsellable = new Set(feed.filter((p) => !sellable(p)).map((p) => p.handle));
 const col = compareCollections({ source: colReads, ours: ourCol, liveSourceIds: srcHandles, served: servedCounts, servedSource, ourActive, unsellable });

 // PRICE ON THE PAGE. The cart charges the item record; a captured product page carries the price
 // from crawl day. Sampling our OWN pages is the only way to know those agree — the number in the
 // database is right by definition and tells us nothing about what a shopper reads.
 const priced = seller ? await sql`SELECT source_id, price_cents, currency FROM items WHERE seller_id=${seller.id} AND status='active' AND source_id IS NOT NULL AND price_cents IS NOT NULL ORDER BY updated_at DESC NULLS LAST LIMIT 15` as { source_id: string; price_cents: number; currency: string | null }[] : [];
 let priceChecked = 0; const priceStale: string[] = []; let priceUnstated = 0;
 for (const it of priced) {
  const r = await fetch(`http://${slug}.vyasites.test:${port}/products/${it.source_id}`, { headers: UA, signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (!r?.ok) continue;
  const page = await r.text().catch(() => "");
  if (!/name=["']vya:product-price["']/.test(page)) { priceUnstated++; continue; }
  // Tags out, entities in: what a shopper reads, near enough for a currency-anchored search.
  const visible = page.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
   .replace(/&pound;/g, "\u00a3").replace(/&#163;/g, "\u00a3").replace(/&euro;/g, "\u20ac").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  priceChecked++;
  if (!pageShowsPrice(visible, it.price_cents, it.currency)) priceStale.push(it.source_id);
 }
 catalog = { ...catalog, priceChecked, priceStale, priceUnstated };
 catalog = { ...catalog, sourceProducts: feed.length, ourItems: ours.length, missingHere: missingHere.length, extraHere: extraHere.length, availabilityMismatch: availMismatch,
  productParityPct: pct(feed.length - missingHere.length, feed.length),
  ...col,
  // NAMED, not counted. "9 products missing" with no list cost an afternoon of re-deriving it from
  // the seller's own feed; anyone reading this should be able to open the product and look.
  sampleMissing: missingHere.slice(0, 5).map((p) => p.handle),
  missingProducts: missingHere.slice(0, 40).map((p) => ({ handle: p.handle, title: p.title, url: `${origin}/products/${p.handle}` })),
  missingNoPhoto: classified.noPhoto.length,
  missingNoPhotoProducts: classified.noPhoto.slice(0, 40).map((p) => ({ handle: p.handle, title: p.title, url: `${origin}/products/${p.handle}` })),
  soldOrUnlisted: classified.unsellable.length };
}
report.catalog = catalog;

// ── PAGES ────────────────────────────────────────────────────────────────────────────────────────
const captured = new Set((await sql`SELECT path FROM site_captures WHERE store_slug=${slug}` as { path: string }[]).map((r) => r.path.replace(/\/$/, "") || "/"));
const sitemapPaths = new Set<string>();
try {
 const root = await fetch(`${origin}/sitemap.xml`, { headers: UA, signal: AbortSignal.timeout(20000) }).then((r) => r.text());
 const subs = [...root.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => /sitemap_(pages|collections|blogs)/.test(u));
 for (const s of subs) { const xml = await fetch(s, { headers: UA, signal: AbortSignal.timeout(20000) }).then((r) => r.text()); for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapPaths.add(new URL(m[1].replace(/&amp;/g, "&")).pathname.replace(/\/$/, "") || "/"); }
} catch { /* no sitemap — reported as unknown below */ }
// A shop selling into several markets lists every page once per language, so `/ja/collections/heels`
// is the same page as `/collections/heels`. Comparing the sitemap raw reported 47 translations as
// uncopied pages on ascensio-demo. A prefix only counts as a language when the page beneath it is
// one we actually hold — see pagesGenuinelyMissing.
const missingPages = pagesGenuinelyMissing([...sitemapPaths].filter((p) => !captured.has(p)), captured);
report.pages = { sitemap: sitemapPaths.size, captured: captured.size, missingHere: missingPages.length, sample: missingPages.slice(0, 6), pageParityPct: sitemapPaths.size ? pct(sitemapPaths.size - missingPages.length, sitemapPaths.size) : null };

// ── SHOPPER ──────────────────────────────────────────────────────────────────────────────────────
const [busiest] = await sql`SELECT path FROM site_captures WHERE store_slug=${slug} AND path LIKE '/collections/%' AND path NOT LIKE '%/' AND path <> '/collections/all' ORDER BY (length(html) - length(replace(html, '/products/', ''))) DESC LIMIT 1` as { path: string }[];
const [prod] = seller ? await sql`SELECT source_id FROM items WHERE seller_id=${seller.id} AND status='active' AND source_id IS NOT NULL ORDER BY created_at DESC LIMIT 1` as { source_id: string }[] : [];
const pages = ["/", busiest?.path, prod ? `/products/${prod.source_id}` : null].filter(Boolean) as string[];

const EXTRACT = (VOLATILE: string) => {
 const vis = (el: Element) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05 && r.width > 1 && r.height > 1; };
 const txt = (el: Element | null) => (el?.textContent || "").replace(/\s+/g, " ").trim();
 // Products are collected separately (COLLECT_PRODUCT_LINKS) and identified by the handle in their
 // URL, not by their displayed text: themes that cover a tile with an empty <a> used to read as a
 // page with no products at all, on both sides, which graded as "couldn't compare".
 // Prices as currency+amount, so "$1,200.00 USD", "$1,200" and "USD 1200" are the same price and a
 // page is not "wrong" for formatting. Deduped: the same price twice is one price.
 const money = /(?:[$£€]|USD|GBP|EUR|CAD|AUD)\s?\d[\d,]*(?:\.\d{2})?/g;
 const CUR: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", CAD: "C$", AUD: "A$" };
 const norm = (m: string) => { const c = m.match(/[$£€]|[A-Z]{3}/)![0]; const amt = Number(m.replace(/[^\d.]/g, "")); return `${CUR[c] ?? c}${amt}`; };
 // NOT the whole page. "You may also like" is picked fresh per visit, by her shop and by ours, from
 // different pools — re-reading one of those pages minutes later, the very prices this check had
 // reported as missing were gone from her page too. That difference is already recorded once, as a
 // cosmetic finding; counting it again as a blocking price mismatch is what put eight stores on the
 // blocking list. See app/lib/parity-regions.ts.
 const priceText = (() => {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(VOLATILE).forEach((e) => e.remove());
  return clone.innerText || "";
 })();
 const prices = [...new Set((priceText.match(money) || []).map(norm))].slice(0, 60);
 const nav = [...document.querySelectorAll("header a, nav a, [class*='header'] a, [class*='menu'] a")].filter(vis).map(txt).filter((t) => t && t.length < 30);
 const heads = [...document.querySelectorAll("h1, h2")].filter(vis).map(txt).filter(Boolean).slice(0, 12);
 const imgs = [...document.images].filter((i) => vis(i) && i.naturalWidth > 0).length;
 return { prices, nav: [...new Set(nav)].slice(0, 30), heads, imgs, text: document.body.innerText.trim().length };
};
const seq = (a: string[], b: string[]) => { const B = new Set(b.map((x) => x.toLowerCase())); const hit = a.filter((x) => B.has(x.toLowerCase())).length; return { hit, of: a.length }; };
const orderMatch = (a: string[], b: string[]) => { let m = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i].toLowerCase() === b[i].toLowerCase()) m++; return { m, of: Math.min(a.length, b.length) }; };

const browser: Browser = await chromium.launch({ args: ["--run-all-compositor-stages-before-draw"] });

/**
 * A price is only MISSING if her page still shows it on a second look.
 *
 * Her pages are not the same twice. VOLATILE_SELECTOR removes the strips we know are picked per
 * visit, but it cannot know every theme's markup, and one price that slipped through was enough to
 * grade a store as failing — on loved-again a hand check found ALL FOURTEEN of her prices present
 * on ours, while the run had reported 14 of 15.
 *
 * "Your store shows the wrong price" is the most alarming thing this check can say to a seller, and
 * the most expensive to be wrong about. So it costs one extra page load, only when something looks
 * wrong, to say it on the strength of two readings rather than one.
 */
async function confirmMissingPrices(candidates: string[], sourceUrl: string): Promise<string[]> {
 if (!candidates.length) return [];
 const pg = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 try {
  await pg.goto(sourceUrl, { waitUntil: "load", timeout: 60000 });
  await pg.waitForTimeout(3500);
  await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); } window.scrollTo(0, 0); });
  await pg.waitForTimeout(1200);
  const again = new Set((await pg.evaluate(EXTRACT, VOLATILE_SELECTOR)).prices);
  const gone = candidates.filter((c) => !again.has(c));
  if (gone.length) console.log(`   prices  ${gone.length} of ${candidates.length} were not on her page the second time either — not counted: ${gone.join(", ")}`);
  return candidates.filter((c) => again.has(c)).slice(0, 5);
 } catch {
  // Could not look twice. Report what one reading saw rather than silently clearing it.
  return candidates.slice(0, 5);
 } finally { await pg.close(); }
}
const shopper: Record<string, unknown> = {};
for (const p of pages) {
 const grab = async (url: string, tag: string) => {
  const pg = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try { await pg.goto(url, { waitUntil: "load", timeout: 60000 }); await pg.waitForTimeout(3500);
   await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); } window.scrollTo(0, 0); }); await pg.waitForTimeout(1500);
   const d = await pg.evaluate(EXTRACT, VOLATILE_SELECTOR);
   const links = await pg.evaluate(COLLECT_PRODUCT_LINKS) as ProductLinkCandidate[];
   // AFTER every number is read, before the picture is taken. Several sellers' live sites open a
   // newsletter modal a few seconds in, so half of every side-by-side pair was a photo of a popup —
   // and ours never has one, which made each of those pairs look like a difference we caused.
   await pg.keyboard.press("Escape").catch(() => {});
   await pg.evaluate(DISMISS_OVERLAYS).catch(() => {});
   await pg.waitForTimeout(400);
   await pg.screenshot({ path: path.join(OUT, `parity-${tag}${p.replace(/\W+/g, "_") || "_home"}.png`) });
   const products = productsFromLinks(links).slice(0, 40);
   return { ...d, products };
  } catch (e) { return { error: String((e as Error).message).slice(0, 80) } as unknown as ReturnType<typeof EXTRACT> & { products: PageProduct[] }; } finally { await pg.close(); }
 };
 const ours = await grab(`http://${slug}.vyasites.test:${port}${p}`, "ours"), src = await grab(`${origin}${p}`, "source");
 if ((ours as { error?: string }).error || (src as { error?: string }).error) { shopper[p] = { error: (ours as { error?: string }).error || (src as { error?: string }).error }; console.log(`\n${p}: could not load — ${(shopper[p] as { error: string }).error}`); continue; }
 // Compared on handles — the same product however each side chooses to render its name.
 const srcH = src.products.map((x) => x.handle), oursH = ours.products.map((x) => x.handle);
 // A product's name is not a section heading — but which headings ARE product names has to be
 // decided from BOTH pages at once. A theme that labels a piece differently in its link than in its
 // heading matched on one side and not the other, so we-thieves' identical pages reported "11
 // section headings missing". Same list, both sides.
 const allNames = [...src.products, ...ours.products];
 const srcHeads = sectionHeadings(src.heads, allNames), oursHeads = sectionHeadings(ours.heads, allNames);
 const t = seq(srcH, oursH), o = orderMatch(srcH, oursH), pr = seq(src.prices, ours.prices), nv = seq(src.nav, ours.nav), hd = seq(srcHeads, oursHeads);
 const hereH = new Set(oursH);
 shopper[p] = { titlesPresent: `${t.hit}/${t.of}`, titlesInOrder: `${o.m}/${o.of}`, pricesPresent: `${pr.hit}/${pr.of}`, navPresent: `${nv.hit}/${nv.of}`, headingsPresent: `${hd.hit}/${hd.of}`, imgs: `${ours.imgs} vs ${src.imgs}`, text: `${ours.text} vs ${src.text}`,
  // Named for the seller: the handle is the identity, the title is what they call it.
  missingTitles: src.products.filter((x) => !hereH.has(x.handle)).map((x) => x.title || x.handle).slice(0, 5),
  missingPrices: await confirmMissingPrices(src.prices.filter((x) => !ours.prices.includes(x)), `${origin}${p}`) };
 console.log(`\n${p}`);
 console.log(`   products  present ${t.hit}/${t.of} · same order ${o.m}/${o.of}   prices ${pr.hit}/${pr.of}   nav ${nv.hit}/${nv.of}   headings ${hd.hit}/${hd.of}   imgs ${ours.imgs} vs ${src.imgs}   text ${ours.text} vs ${src.text}`);
 const miss = (shopper[p] as { missingTitles: string[] }).missingTitles; if (miss.length) console.log(`   on source, not here: ${miss.map((m) => `"${m.slice(0, 40)}"`).join(", ")}`);
}
await browser.close();
report.shopper = shopper;

console.log(`\n══ ${slug}  (${origin})`);
const c = catalog as Record<string, number | string[]>;
if (c.sourceProducts !== undefined) console.log(`CATALOG   products ${c.productParityPct}%  (${c.sourceProducts} on source · ${c.ourItems} here · ${c.missingHere} missing · ${c.extraHere} extra · ${c.availabilityMismatch} availability mismatches)`);
if (c.collections !== undefined) console.log(`          collections exact ${c.collectionsExact}/${c.collections}${(c.collectionsMissingHere as string[]).length ? " · MISSING here: " + (c.collectionsMissingHere as string[]).join(", ") : ""}${(c.collectionsOff as string[]).length ? " · off: " + (c.collectionsOff as string[]).join(", ") : ""}${(c.collectionsUnread as string[])?.length ? " · COULD NOT READ: " + (c.collectionsUnread as string[]).join(", ") : ""}${(c.collectionsInflated as string[])?.length ? "\n          SERVING PIECES WE DID NOT FILE: " + (c.collectionsInflated as string[]).join(", ") : ""}`);
if (c.priceChecked) console.log(`          prices on the page ${(c.priceChecked as number) - (c.priceStale as string[]).length}/${c.priceChecked} match the item${(c.priceStale as string[]).length ? " \u00b7 STALE: " + (c.priceStale as string[]).slice(0, 4).join(", ") : ""}${c.priceUnstated ? ` \u00b7 ${c.priceUnstated} page(s) stated no price` : ""}`);
const pg = report.pages as { pageParityPct: number | null; sitemap: number; captured: number; missingHere: number; sample: string[] };
console.log(`PAGES     ${pg.pageParityPct === null ? "no sitemap" : pg.pageParityPct + "%"}  (${pg.sitemap} in sitemap · ${pg.captured} captured · ${pg.missingHere} missing${pg.sample.length ? ": " + pg.sample.join(", ") : ""})`);
console.log(`SHOPPER   side-by-side screenshots in ${OUT}/parity-{ours,source}*.png`);
fs.writeFileSync(path.join(OUT, "parity.json"), JSON.stringify(report, null, 1));
