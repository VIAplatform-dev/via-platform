/**
 * Does a hosted store survive the seller cancelling Shopify?
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/blackout-check.mts <slug> [--port 3333] [--label before]
 *
 * Loads each of the store's key pages twice in Chromium: normally, then with EVERY Shopify host and
 * our own /cdn proxy blocked — which is what a cancelled subscription looks like from the browser.
 * Reports what a shopper would lose: console errors, requests that failed, images that never got
 * pixels, and geometry. This is the acceptance test for theme-asset rehosting: a store passes when
 * the blocked render matches the normal one.
 */
import { chromium } from "playwright";
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { blocksAtCancellation } from "../app/lib/blackout-hosts.ts";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"))!;
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3333";
const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : "run";
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);

// The seller's OWN domain is Shopify too — blummier.com is her Shopify custom domain, and it stops
// serving the day she cancels. Not blocking it scored every asset loaded from it as surviving:
// maison-optimism 43, loved-again 42, love-again-vintage 33, we-thieves 25 — 15 of 23 stores had
// stylesheets, scripts, fonts and images passing the gate that would die for real.
const [homeCap] = await sql`SELECT source_url FROM site_captures WHERE store_slug=${slug} AND path='/'` as { source_url: string }[];
const ownHost = homeCap ? new URL(homeCap.source_url).host.replace(/^www\./, "") : null;

const [busiest] = await sql`SELECT path FROM site_captures WHERE store_slug=${slug} AND path <> '/' ORDER BY (length(html) - length(replace(html, '/products/', ''))) DESC LIMIT 1` as { path: string }[];
const [prod] = await sql`SELECT i.source_id FROM items i JOIN sellers s ON s.id=i.seller_id WHERE s.slug=${slug} AND i.status='active' AND i.source_id IS NOT NULL LIMIT 1` as { source_id: string }[];
const pages = ["/", busiest?.path, prod ? `/products/${prod.source_id}` : null].filter(Boolean) as string[];

const MEASURE = () => {
 const vis = (el: Element) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect();
  return s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05 && r.width > 1 && r.height > 1; };
 const imgs = [...document.images];
 const header = document.querySelector("header, [class*='header']");
 const logo = document.querySelector("header img, [class*='logo'] img, [class*='header'] img") as HTMLImageElement | null;
 // CSS backgrounds are invisible to an <img> count, and a hero is routinely one. The first pass of
 // this gate reported a homepage "unchanged" while its hero had become a beige void — the metric
 // counted 25/27 images both times because the missing one was never an <img>. So: every element
 // with a background-image, and whether that image actually decoded.
 const bgEls = [...document.querySelectorAll("*")].filter((el) => /url\(/.test(getComputedStyle(el).backgroundImage) && el.getBoundingClientRect().width > 200 && el.getBoundingClientRect().height > 120);
 const bgUrls = bgEls.map((el) => getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1] || "").filter(Boolean);
 const vids = [...document.querySelectorAll("video")];
 return {
  videos: vids.length,
  // readyState >= 2 means the browser has at least the current frame — a video that will never
  // paint (its source is on a host that is now gone) sits at 0 forever.
  videosPlaying: vids.filter((v) => (v as HTMLVideoElement).readyState >= 2).length,
  bgImages: bgUrls.length,
  bgImagesShopify: bgUrls.filter((u) => /cdn\/shop|shopify/.test(u)).length,
  text: (document.body.innerText || "").trim().length,
  imgs: imgs.length, imgsLoaded: imgs.filter((i) => i.naturalWidth > 0).length,
  // Photos coming from the platform TODAY. A runtime widget can repaint a grid with the seller's
  // Shopify photos over ours, which no server-side rewrite can reach — and the blackout run then
  // looks healthier because the widget is dead. Counting them in the NORMAL run is the only way
  // that shows up as the problem it is.
  imgsOnPlatform: imgs.filter((i) => /(^|\.)(myshopify\.com|shopify\.com|shopifycloud\.com)$/i
   .test((() => { try { return new URL(i.currentSrc || i.src, location.href).host; } catch { return ""; } })())).length,
  headerVisible: header ? vis(header) : null,
  logoLoaded: logo ? logo.naturalWidth > 0 : null,
  fontsLoaded: (document as unknown as { fonts: { size: number } }).fonts?.size ?? null,
  productLinks: new Set([...document.querySelectorAll("a[href*='/products/']")].map((a) => a.getAttribute("href"))).size,
 };
};

const browser = await chromium.launch({ args: ["--run-all-compositor-stages-before-draw"] });
const out: Record<string, unknown> = { slug, label, pages: {} };
for (const p of pages) {
 const rows: Record<string, unknown> = {};
 for (const blocked of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [], failed: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 100)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 100)); });
  page.on("requestfailed", (r) => failed.push(new URL(r.url()).pathname.slice(0, 60)));
  // Decided on the HOST, never on the URL string. Matching "/cdn/" or "myshopify.com" anywhere in
  // the URL aborted `instafeed.nfcube.com/cdn/instafeed.css` and
  // `cdn.nfcube.com/instafeed.js?shop=x.myshopify.com` — an Instagram widget with no connection to
  // Shopify — which alone accounted for 115 of 213 "lost images" and 6 of 7 "lost videos" across
  // four stores whose storefronts were fine. See app/lib/blackout-hosts.ts.
  if (blocked) await page.route("**/*", (route) => {
   const u = route.request().url();
   return blocksAtCancellation(u, ownHost, `${slug}.vyasites.test`) ? route.abort() : route.continue();
  });
  try {
   await page.goto(`http://${slug}.vyasites.test:${port}${p}`, { waitUntil: "load", timeout: 90000 });
   await page.waitForTimeout(3500);
   await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); } window.scrollTo(0, 0); });
   await page.waitForTimeout(1500);
   let m = await page.evaluate(MEASURE);
   // A PAGE THAT RENDERED NOTHING IS NOT A MEASUREMENT. the-objects-of-affection was graded
   // "0/3 pages survive" on two blank renders — one of them the NORMAL run, which blocking cannot
   // explain, and which reproduced zero times in eight reloads. `failed: 0` means the page never
   // even issued a request. Retry once, and if it happens again record it as an error rather than
   // as a store that lost everything.
   if (!m.text && !m.imgs) {
    await page.reload({ waitUntil: "load", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(3500);
    m = await page.evaluate(MEASURE);
   }
   fs.mkdirSync(path.join(".verify", slug), { recursive: true });
   await page.screenshot({ path: path.join(".verify", slug, `${label}-${blocked ? "BLACKOUT" : "normal"}${p.replace(/\W+/g, "_") || "_home"}.png`) });
   rows[blocked ? "blackout" : "normal"] = (!m.text && !m.imgs)
    ? { error: "rendered nothing twice — the check could not read this page" }
    : { ...m, errors: errors.length, failed: failed.length, failedSample: [...new Set(failed)].slice(0, 4) };
  } catch (e) { rows[blocked ? "blackout" : "normal"] = { error: String((e as Error).message).slice(0, 80) }; }
  await page.close();
 }
 (out.pages as Record<string, unknown>)[p] = rows;
 const n = rows.normal as Record<string, number>, b = rows.blackout as Record<string, number>;
 console.log(`\n${p}`);
 console.log(`   normal   : text ${n.text} · imgs ${n.imgsLoaded}/${n.imgs} · bg ${n.bgImages}(${n.bgImagesShopify} shopify) · video ${n.videosPlaying}/${n.videos} · header ${n.headerVisible} · logo ${n.logoLoaded} · links ${n.productLinks} · errors ${n.errors} · failed ${n.failed}`);
 console.log(`   BLACKOUT : text ${b.text} · imgs ${b.imgsLoaded}/${b.imgs} · bg ${b.bgImages}(${b.bgImagesShopify} shopify) · video ${b.videosPlaying}/${b.videos} · header ${b.headerVisible} · logo ${b.logoLoaded} · links ${b.productLinks} · errors ${b.errors} · failed ${b.failed}`);
 // Either run unreadable means we do not know what this page does at cancellation. Saying "loses
 // everything" would be inventing a finding out of our own failure to load it.
 if (!n || !b || (n as unknown as { error?: string }).error || (b as unknown as { error?: string }).error) {
  console.log(`   → COULD NOT CHECK: ${((n as unknown as { error?: string })?.error) || ((b as unknown as { error?: string })?.error)}`);
  continue;
 }
 const loss: string[] = [];
 // FEWER IMAGE ELEMENTS is a DOM change, not a loading failure: a widget or filter app that dies
 // under blackout takes its own markup with it. thenicheshop was reported as losing 8 images when
 // its blackout run was actually HEALTHIER — 90 images all on our storage, versus 66 of ours plus
 // 32 of Shopify's when the filter app repaints the grid. Only count images that were THERE and
 // failed to load.
 const stillThere = Math.min(n.imgs, b.imgs);
 const lostLoading = Math.max(0, Math.min(n.imgsLoaded, stillThere) - Math.min(b.imgsLoaded, stillThere));
 if (lostLoading > 0) loss.push(`${lostLoading} image(s) lost`);
 if (b.imgs < n.imgs) console.log(`   note     : ${n.imgs - b.imgs} image element(s) removed with a blocked widget, not failed to load`);
 // Photos served from the platform TODAY — the ones that would die tomorrow. A finding in its own
 // right, and the only one that survives a widget repainting the grid at runtime.
 if (n.imgsOnPlatform > 0) loss.push(`${n.imgsOnPlatform} photo(s) served from the platform right now`);
 if (n.logoLoaded && !b.logoLoaded) loss.push("LOGO lost");
 if (n.headerVisible && !b.headerVisible) loss.push("HEADER lost");
 if (b.productLinks < n.productLinks) loss.push(`${n.productLinks - b.productLinks} product(s) lost`);
 // A background still pointing at Shopify under blackout is a background that did not paint.
 if (b.bgImagesShopify > 0) loss.push(`${b.bgImagesShopify} CSS background(s) still on Shopify — hero/banner lost`);
 if (n.videosPlaying > 0 && b.videosPlaying < n.videosPlaying) loss.push(`${n.videosPlaying - b.videosPlaying} video(s) lost — hero video source is on Shopify`);
 if (b.text < n.text * 0.9) loss.push(`${Math.round((1 - b.text / n.text) * 100)}% of visible text lost`);
 console.log(`   → ${loss.length ? "LOSES: " + loss.join(", ") : "SURVIVES cancellation unchanged"}`);
}
fs.writeFileSync(path.join(".verify", slug, `blackout-${label}.json`), JSON.stringify(out, null, 1));
await browser.close();
