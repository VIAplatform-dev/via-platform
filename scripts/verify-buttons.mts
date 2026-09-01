/**
 * Does VYA's buy area LOOK right on every store?
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/verify-buttons.mts
 *   …--store thenicheshop
 *
 * verify-carts.mts asks whether the cart WORKS. This asks whether it looks like it belongs — the
 * class of fault a passing test never notices and a shopper sees immediately.
 *
 * It grew out of one real bug: VYA's buttons wear the theme's own classes so they look native, and
 * on one store that class painted a fully-rounded pill behind the button via ::after. Our button is
 * square, so the pill poked out at every corner. Nothing was wrong in the DOM — the shape was drawn
 * by CSS, which is why inspecting elements kept coming up empty.
 *
 * Checks, per store, on a real product page:
 *   • a decorative ::before/::after painting behind VYA's buttons
 *   • any other element whose box overlaps them
 *   • leftover theme buy controls sitting in the same block
 */
import { chromium, type Browser } from "playwright";
import { neon } from "@neondatabase/serverless";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "http://localhost:3333").replace(/\/+$/, "");
const PORT = new URL(BASE).port || "80";
const SUFFIX = (process.env.STORE_HOST_SUFFIX || "vyasites.test").replace(/^\./, "");
const ONLY = arg("store");

type Finding = { store: string; ok: boolean; notes: string[] };

async function checkStore(browser: Browser, slug: string): Promise<Finding> {
 const f: Finding = { store: slug, ok: false, notes: [] };
 const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
 const page = await ctx.newPage();
 const origin = `http://${slug}.${SUFFIX}:${PORT}`;
 try {
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 15000 });
  const links = [...new Set(await page.locator('a[href*="/products/"], a[href*="/shop/p/"]').evaluateAll((els) =>
   els.map((e) => (e as HTMLAnchorElement).getAttribute("href") || "").filter(Boolean)))].slice(0, 4);
  if (!links.length) { f.notes.push("no product links to check"); return f; }

  for (const l of links) {
   await page.goto(new URL(l, origin).toString(), { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
   await page.waitForTimeout(2200);
   const r = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("[data-vya-add], a[href*='/checkout?item=']")] as HTMLElement[];
    if (!btns.length) return null;
    const notes: string[] = [];
    for (const el of btns) {
     const box = el.getBoundingClientRect();
     if (box.width < 20) continue;
     // A pseudo-element that actually paints something behind our button.
     for (const pseudo of ["::before", "::after"]) {
      const s = getComputedStyle(el, pseudo);
      const paints = s.content !== "none" && (s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.borderWidth !== "0px" || s.boxShadow !== "none");
      if (paints && s.display !== "none") {
       notes.push(`${pseudo} paints ${s.backgroundColor} radius=${s.borderRadius} behind "${(el.textContent || "").trim().slice(0, 14)}"`);
      }
     }
     // What is actually drawn ON TOP, by hit-testing the button's own area.
     //
     // Comparing bounding boxes is not the test: a section's background panel overlaps every button
     // on the page and sits harmlessly behind it. elementFromPoint answers the question a shopper's
     // eye asks — if I click here, what do I touch? Anything that is not our button (or inside it)
     // is genuinely covering it.
     const probes: [number, number][] = [
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + 4, box.top + 4], [box.right - 4, box.top + 4],
      [box.left + 4, box.bottom - 4], [box.right - 4, box.bottom - 4],
     ];
     for (const [x, y] of probes) {
      if (x < 0 || y < 0 || y > innerHeight || x > innerWidth) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
      const h = hit as HTMLElement;
      const hs = getComputedStyle(h);
      if (hs.backgroundColor === "rgba(0, 0, 0, 0)" && hs.borderWidth === "0px" && !h.textContent?.trim()) continue;
      notes.push(`covered by <${h.tagName.toLowerCase()}${h.id ? "#" + h.id : ""}${h.className ? "." + String(h.className).split(" ")[0] : ""}> bg=${hs.backgroundColor}`);
     }
     // A theme buy control still visible in the same block as ours.
     const scope = el.closest("form,[class*='product-form'],[class*='product__info'],[class*='product-info']");
     if (scope) {
      for (const leftover of scope.querySelectorAll('[name="add"],[class*="payment-button"],[class*="shopify-payment"]')) {
       const ls = getComputedStyle(leftover as Element);
       if (ls.display !== "none" && ls.visibility !== "hidden") notes.push(`leftover theme control <${leftover.tagName.toLowerCase()}> still visible`);
      }
     }
    }
    return { count: btns.length, notes: [...new Set(notes)] };
   });
   if (!r) continue;
   f.notes.push(...r.notes);
   f.ok = r.notes.length === 0;
   return f;
  }
  f.notes.push("no product page carried VYA buy buttons");
 } catch (e) {
  f.notes.push(`threw: ${String((e as Error).message).slice(0, 60)}`);
 } finally {
  await ctx.close().catch(() => {});
 }
 return f;
}

async function main() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) { console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local …"); process.exit(1); }
 const rows = (await neon(url)`
  SELECT c.store_slug FROM (SELECT DISTINCT store_slug FROM site_captures) c
  JOIN sellers s ON s.slug = c.store_slug ORDER BY c.store_slug
 `) as { store_slug: string }[];
 const stores = (ONLY ? rows.filter((r) => r.store_slug === ONLY) : rows).map((r) => r.store_slug);

 const browser = await chromium.launch({ channel: "chrome", headless: true, args: [`--host-resolver-rules=MAP *.${SUFFIX} 127.0.0.1`] });
 console.log(`\nChecking the buy area on ${stores.length} store(s)\n`);
 const all: Finding[] = [];
 for (const slug of stores) {
  const f = await Promise.race([
   checkStore(browser, slug),
   new Promise<Finding>((r) => setTimeout(() => r({ store: slug, ok: false, notes: ["timed out"] }), 70000)),
  ]);
  all.push(f);
  console.log(`  ${slug.padEnd(28)} ${f.ok ? "clean" : f.notes[0] ? f.notes[0].slice(0, 74) : "no buttons found"}`);
 }
 await browser.close();
 const bad = all.filter((f) => !f.ok);
 console.log(`\n${all.length - bad.length} of ${all.length} stores have a clean buy area.\n`);
 for (const f of bad) {
  console.log(f.store);
  for (const n of [...new Set(f.notes)].slice(0, 4)) console.log(`   • ${n}`);
 }
 console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
