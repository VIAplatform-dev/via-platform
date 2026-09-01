/**
 * Browser verification for a hosted (captured) storefront.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/verify-store.mts <slug> [...slugs]
 *
 * WHY THIS EXISTS. Every server-side check this codebase has — unit tests, `npm run eval:import`,
 * curl'ing the served HTML — passed on pages that were visibly broken in a browser:
 *   • a full-viewport loading overlay painted the whole store black,
 *   • a product grid sat at `opacity: .000001` because its AOS anchors pointed at stripped ids,
 *   • collection grids rendered with no <img> at all,
 *   • sold pieces kept a working Add to cart,
 *   • a grid rendered 2-up at 720px where the source store renders 6-up full width.
 * The DOM was correct in every one of those cases. Presence is not rendering, and rendering is not
 * fidelity — so this measures COMPUTED STYLE and GEOMETRY, and diffs the geometry against the live
 * source store, which is the actual product requirement (1-to-1 with the seller's site).
 *
 * Needs: the dev server on $VERIFY_PORT (default 3333) with STORE_HOST_SUFFIX set, and a
 * `127.0.0.1 <slug>.vyasites.test` entry in /etc/hosts.
 *
 * Exit code is non-zero if any store FAILS, so this can gate a deploy.
 */
import { chromium, type Browser, type Page } from "playwright";
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const PORT = process.env.VERIFY_PORT || "3333";
const SUFFIX = process.env.STORE_HOST_SUFFIX || "vyasites.test";
const OUT = path.join(process.cwd(), ".verify");
const VIEWPORT = { width: 1440, height: 1000 };
/** Hosts that belong to the platform we are supposed to be replacing. A hosted store must not talk
 *  to any of them: that is the difference between "migrated" and "still on Shopify with our paint". */
const FOREIGN = /myshopify\.com|shop\.app|shopifysvc\.com|shopifycloud\.com|cdn\.shopify\.com|checkout\.shopify\.com/i;

type GridShape = { cards: number; visible: number; cardW: number; perRow: number; imgs: number; imgsLoaded: number };
type PageReport = {
 pathName: string; status: number; ok: boolean;
 grid: GridShape | null; sourceGrid: GridShape | null;
 overlayVisible: boolean; blockers: number; blockerNote: string[]; bodyText: number;
 soldVisible: number; addButtons: number; checkoutLinks: number;
 vyaErrors: string[]; foreignErrors: string[];
 failedOwnOrigin: string[]; foreignRequests: string[];
 problems: string[]; warnings: string[]; interactions: Interaction[];
};

/** Measure the product grid the way a shopper sees it: geometry of things that actually link to a
 *  product, not a class name. Runs identically on our page and on the source store, which is the
 *  only way the two numbers are comparable. */
const MEASURE = () => {
 const vis = (el: Element) => {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05 && r.width > 1 && r.height > 1;
 };
 const links = [...document.querySelectorAll("a[href*='/products/'], a[href*='/shop/p/']")];
 // ONE card per product, keyed by href. A theme tile normally holds several links to the same
 // product — the photo, the title, sometimes the price — and each of those can resolve to a
 // DIFFERENT ancestor. Walking up from every link independently counted most tiles twice: a grid
 // rendering 4 across reported "8-up", and 16 products reported as 32 cards. The comparison against
 // the source survived it (both sides were doubled the same way) but the numbers were not real, and
 // a theme that doubles on one side only would have produced a phantom layout difference.
 const byHref = new Map<string, Element[]>();
 for (const a of links) {
  const href = (a.getAttribute("href") || "").split("?")[0];
  if (!href) continue;
  const g = byHref.get(href);
  if (g) g.push(a); else byHref.set(href, [a]);
 }
 // One tile per product: from that product's first link, walk up to the nearest ancestor carrying a
 // photo. Deliberately NOT "the ancestor containing every link for this href" (a product appearing
 // in both a carousel and the grid forces the walk up to a whole section), and NOT the media link
 // measured directly (some themes put the <img> outside the anchor, which returned zero cards).
 // Both alternatives were tried against real stores and were worse.
 const list: Element[] = [];
 const seen = new Set<Element>();
 for (const group of byHref.values()) {
  let el: Element | null = group[0];
  for (let i = 0; i < 6 && el; i++) {
   if (el.querySelector("img") && el.getBoundingClientRect().width > 100) break;
   el = el.parentElement;
  }
  if (el && el !== document.body && el !== document.documentElement && !seen.has(el)) { seen.add(el); list.push(el); }
 }
 const rects = list.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 60 && r.height > 60);
 // Modal width = the repeated card width; ignores a stray hero/promo tile in the same container.
 const widths = rects.map((r) => Math.round(r.width));
 const freq = new Map<number, number>();
 for (const w of widths) freq.set(w, (freq.get(w) ?? 0) + 1);
 const cardW = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
 // Cards per row = the most cards sharing a top offset (bucketed, so sub-pixel drift doesn't split a row).
 const rows = new Map<number, number>();
 for (const r of rects) { const k = Math.round(r.top / 20); rows.set(k, (rows.get(k) ?? 0) + 1); }
 const perRow = Math.max(0, ...rows.values());
 const imgs = list.flatMap((c) => [...c.querySelectorAll("img")]);
 return {
  cards: list.length,
  visible: list.filter(vis).length,
  cardW, perRow,
  imgs: imgs.length,
  imgsLoaded: imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length,
 };
};

const PAGE_STATE = () => {
 const vis = (el: Element) => {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05 && r.width > 1 && r.height > 1;
 };
 const overlay = [...document.querySelectorAll("loading-overlay, [class*='loading-overlay'], [class*='page-transition']")];
 const sold = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /sold\s*out/i.test(e.textContent || "") && vis(e));
 // Anything COVERING the store, found by geometry rather than by class name. A named check for
 // "loading-overlay" reported a clean page while two stacked modals (a region picker and a
 // newsletter capture, injected by the seller's own Shopify apps) dimmed the whole viewport. What
 // matters to a shopper is "is a big opaque thing on top of the shop", which is measurable.
 const vw = window.innerWidth * window.innerHeight;
 const blockers = [...document.querySelectorAll("body *")].filter((el) => {
  const s = getComputedStyle(el);
  // FIXED only. Modals, backdrops and cookie/region walls are fixed so they stay put while the page
  // scrolls; a big `absolute` box is almost always ordinary page furniture — a hero caption on one
  // store was flagged as "covering the page" when it is simply text inside the hero image.
  if (s.position !== "fixed") return false;
  if (!vis(el)) return false;
  if (s.pointerEvents === "none") return false;               // decorative, can't block a click
  const r = el.getBoundingClientRect();
  // The area that actually OVERLAPS the viewport, not the element's own size. A closed cart drawer
  // or wishlist panel is full-height, `position: fixed` and computed-visible — it is simply parked
  // off-screen with a transform. Measuring its own box flagged three "covers" on a store a human
  // had just described as clean.
  const ox = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
  const oy = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
  if (ox * oy < vw * 0.2) return false;                       // small sticky headers are fine
  if ((parseInt(s.zIndex) || 0) < 5) return false;            // not stacked above the content
  if (el.querySelector("[data-vya-collection]")) return false; // a page wrapper, not a cover
  if (el.closest(".vya-powered, [data-vya-sold]")) return false;
  return true;
 });
 return {
  overlayVisible: overlay.some(vis),
  blockers: blockers.length,
  blockerNote: blockers.slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(/\s+/)[0] || "?"} "${(el.textContent || "").trim().slice(0, 40)}"`),
  bodyText: (document.body.innerText || "").trim().length,
  soldVisible: sold.length,
  addButtons: [...document.querySelectorAll("[data-vya-add]")].filter(vis).length,
  checkoutLinks: [...document.querySelectorAll("a[href*='/checkout?item=']")].filter(vis).length,
 };
};

async function scrollThrough(page: Page) {
 await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
  window.scrollTo(0, 0);
 });
 await page.waitForTimeout(1500);
}

async function measureSource(browser: Browser, url: string): Promise<GridShape | null> {
 const page = await browser.newPage({ viewport: VIEWPORT });
 try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  await scrollThrough(page);
  return (await page.evaluate(MEASURE)) as GridShape;
 } catch {
  return null; // the source refused or timed out — reported as "not compared", never as a pass
 } finally {
  await page.close();
 }
}

/**
 * DRIVE the store, don't just load it.
 *
 * A page load exercises almost none of what a theme actually does. Every endpoint gap found so far
 * came from the handful of requests a page makes on arrival — but a shopper opens the cart drawer,
 * hits quick-add, filters a collection and searches, and each of those calls something else. Those
 * are the paths where a per-store surprise (an app endpoint, a progress bar reading a cart field we
 * don't return) actually lives, and none of them fire on load.
 *
 * Every step is best-effort and theme-agnostic: themes share no class vocabulary, so each selector
 * list is a guess and a miss is reported as "not found", never as a pass. What matters is not that
 * the click worked — it's which requests to OUR origin failed while it was happening.
 */
type Interaction = { name: string; performed: boolean; effect: string; newFailures: string[]; newErrors: string[] };

const SELECTORS: Record<string, string[]> = {
 // Cart drawers open from a button; a bare <a href="/cart"> navigates instead, so it is the last resort.
 cart: ["[data-cart-drawer-toggle]", "button[aria-label*='cart' i]", "a[aria-label*='cart' i]", "#cart-icon-bubble",
        "[class*='cart-toggle']", "[class*='cart__toggle']", "[href='/cart']"],
 // Most themes hide search behind <details><summary>, not a <button> — matching only buttons found
 // it on none of the first stores tried.
 search: ["[data-search-toggle]", "details summary[class*='search']", "summary[aria-label*='search' i]",
          "button[aria-label*='search' i]", "[class*='search-toggle']", "[class*='header__icon--search']",
          "a[href*='/search']", "input[name='q']", "input[type='search']",
          "button:has-text('Search')", "[role='button'][aria-label*='search' i]"],
 quickAdd: ["[data-product-quickshop]", "button[name='add']", "[class*='quick-add'] button", "[class*='quick-buy'] button",
            "[class*='quickshop']", "form[action*='/cart/add'] button", "form[action*='/cart/add'] [type='submit']",
            // On a captured product page the theme's <form>/<button name=add> is replaced by an <a>
            // carrying the theme's classes, so button-only selectors found nothing on a PDP.
            "[data-vya-add]", "a[class*='AddToCart']", "a[class*='product-form__submit']",
            "button:has-text('Add to cart')", "a:has-text('Add to cart')", "a:has-text('Add to bag')"],
 // Sort/filter are almost never a <select>; they are disclosure widgets.
 filter: ["details summary[class*='facet']", "[class*='facets'] summary", "[class*='filter'] summary",
          "summary[class*='disclosure']", "[class*='sort'] summary", "button[class*='filter']",
          "select[name*='sort']", "[class*='collection__sort']"],
};

async function drive(page: Page, host: string, snapshot: () => { fails: string[]; errs: string[] }): Promise<Interaction[]> {
 const out: Interaction[] = [];
 const startUrl = page.url();
 const run = async (name: string, keys: string[], after: () => Promise<string>) => {
  // Fresh page per interaction. The cart drawer opens over the whole viewport, so running these in
  // sequence meant every step after the first found nothing and reported NOT FOUND — 1 of 4 on every
  // store, including "no add-to-cart on a product page", which is obviously false.
  await page.goto(startUrl, { waitUntil: "load", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const before = snapshot();
  panelsBefore = await panelIds();
  let performed = false, effect = "no matching control found";
  try {
   outer: for (const sel of keys) {
    const loc = page.locator(sel);
    const n = Math.min(await loc.count().catch(() => 0), 4);
    for (let i = 0; i < n; i++) {
     const el = loc.nth(i);
     if (!(await el.isVisible().catch(() => false))) continue; // themes ship a hidden duplicate first
     // A normal click first: it fails when something COVERS the control, which is itself the finding.
     // Reporting that as "the cart did not change" blamed the commerce bridge for a newsletter modal
     // sitting on top of the buy button — two very different bugs with two very different fixes.
     let covered = "";
     try {
      await el.click({ timeout: 4000, noWaitAfter: true });
     } catch {
      covered = await page.evaluate((sel) => {
       const t = document.querySelector(sel) as HTMLElement | null;
       if (!t) return "unknown";
       const r = t.getBoundingClientRect();
       const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
       if (!top || top === t || t.contains(top)) return "unknown";
       return `${top.tagName.toLowerCase()}.${(top.className || "").toString().split(/\s+/)[0] || "?"}`;
      }, sel).catch(() => "unknown");
      // Then force it, so we still learn whether the control itself works underneath the cover.
      await el.click({ timeout: 4000, noWaitAfter: true, force: true }).catch(() => {});
     }
     performed = true;
     await page.waitForTimeout(2200);
     effect = await after();
     if (covered) effect = `BLOCKED by ${covered} (forced click: ${effect})`;
     break outer;
    }
   }
  } catch (e) { effect = `click failed: ${String((e as Error).message).slice(0, 60)}`; }
  const now = snapshot();
  // Attribute nothing to a step that never ran. Requests from the page load keep landing
  // asynchronously, and a diff taken around a click that never happened captured them anyway —
  // one store was reported as "quick-add triggered a 404" when quick-add was NOT FOUND.
  out.push({
   name, performed, effect,
   newFailures: performed ? now.fails.slice(before.fails.length) : [],
   newErrors: performed ? now.errs.slice(before.errs.length) : [],
  });
 };

 // Did a panel actually appear over the page? That is the difference between "we clicked the cart
 // icon" and "the cart drawer works".
 // What became visible BECAUSE of the click, rather than "is something big on screen". An area
 // threshold got this badly wrong: VYA's own add-to-cart confirmation is a 360px card — about 7.5%
 // of the viewport against a 12% floor — so it opened correctly on ten stores and every one of them
 // was reported as "nothing visibly opened". Snapshot the visible panels, click, snapshot again.
 const panelIds = () => page.evaluate(() => {
  const out: string[] = [];
  const els = [...document.querySelectorAll("body *")];
  for (const el of els) {
   const s = getComputedStyle(el);
   if (s.position !== "fixed" || s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) < 0.05) continue;
   const r = el.getBoundingClientRect();
   if (r.width < 120 || r.height < 60) continue;                      // a pill or badge, not a panel
   if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue; // parked off-screen
   if ((parseInt(s.zIndex) || 0) < 5) continue;
   out.push(`${el.tagName.toLowerCase()}#${el.id || ""}.${(el.className || "").toString().split(/\s+/)[0] || ""}`);
  }
  return out;
 }).catch(() => [] as string[]);
 let panelsBefore: string[] = [];
 const panelVisible = async () => {
  const now = await panelIds();
  const opened = now.filter((x) => !panelsBefore.includes(x));
  return opened.length ? `opened ${opened.slice(0, 2).join(", ")}` : "nothing visibly opened";
 };

 await run("open cart drawer", SELECTORS.cart, async () => {
  if (page.url() !== startUrl) return `navigated to ${new URL(page.url()).pathname} (not a drawer)`;
  return await panelVisible();
 });
 if (page.url() !== startUrl) await page.goto(startUrl, { waitUntil: "load", timeout: 45000 }).catch(() => {});

 // The only add-to-cart check worth having: ask the CART, not the UI. A drawer that fails to open
 // is cosmetic; a click that never reaches the cart means the store cannot take money. Both were
 // indistinguishable while this only looked for a visible panel.
 const cartCount = () => page.evaluate(async () => {
  try {
   const r = await fetch("/cart.js", { headers: { Accept: "application/json" } });
   const j = await r.json();
   return typeof j?.item_count === "number" ? j.item_count : null;
  } catch { return null; }
 });
 const cartBefore = await cartCount();
 // Is the piece on this page actually for sale? A one-of-one store is mostly SOLD stock, and
 // refusing to add a sold piece is correct behaviour — reading that as "add to cart is broken"
 // produced three false "this store cannot take money" findings, one of them on a store whose only
 // testable product page was a sold item.
 const soldOut = await page.evaluate(() => {
  const vis = (el: Element) => { const st = getComputedStyle(el); const r = el.getBoundingClientRect();
   return st.visibility !== "hidden" && st.display !== "none" && parseFloat(st.opacity) > 0.05 && r.width > 1 && r.height > 1; };
  const buy = [...document.querySelectorAll("[data-vya-add], [aria-disabled='true'], button, a")]
   .filter((e) => vis(e) && /sold\s*out|add to (cart|bag)/i.test(e.textContent || ""));
  return buy.length > 0 && buy.every((e) => /sold\s*out/i.test(e.textContent || ""));
 }).catch(() => false);
 await run("add to cart", SELECTORS.quickAdd, async () => {
  const after = await cartCount();
  const panel = await panelVisible();
  if (after === null) return `cart could not be read (${panel})`;
  if (cartBefore !== null && after > cartBefore) return `CART ${cartBefore} -> ${after}; ${panel}`;
  if (soldOut) return `piece is SOLD — correctly not added (${panel})`;
  return `✗ CART UNCHANGED at ${after} — the click did not reach the cart (${panel})`;
 });

 await run("open search", SELECTORS.search, async () => {
  const box = page.locator("input[name='q'], input[type='search']").first();
  if (await box.count()) {
   await box.fill("dress", { timeout: 3000 }).catch(() => {});
   await page.waitForTimeout(2500); // predictive search fires on input
   return "typed a query into the search box";
  }
  return await panelVisible();
 });

 await run("open a filter", SELECTORS.filter, async () => "toggled the first filter control");
 return out;
}

async function checkPage(browser: Browser, host: string, pathName: string, sourceUrl: string | null): Promise<PageReport> {
 const page = await browser.newPage({ viewport: VIEWPORT });
 const vyaErrors: string[] = [], foreignErrors: string[] = [], failedOwnOrigin: string[] = [], foreignRequests: string[] = [];
 const bucket = (text: string, url: string) => (FOREIGN.test(url) || FOREIGN.test(text) ? foreignErrors : vyaErrors).push(text.slice(0, 160));
 page.on("console", (m) => { if (m.type() === "error") bucket(m.text(), m.location()?.url || ""); });
 page.on("pageerror", (e) => vyaErrors.push("PAGEERROR: " + String(e.message).slice(0, 160)));
 page.on("requestfailed", (r) => { if (FOREIGN.test(r.url())) foreignRequests.push(r.url().slice(0, 120)); else if (r.url().includes(host)) failedOwnOrigin.push(`${r.failure()?.errorText} ${new URL(r.url()).pathname.slice(0, 70)}`); });
 page.on("request", (r) => { if (FOREIGN.test(r.url())) foreignRequests.push(`${r.method()} ${r.url().slice(0, 110)}`); });
 page.on("response", (r) => { if (r.status() >= 400 && r.url().includes(host)) failedOwnOrigin.push(`HTTP ${r.status()} ${new URL(r.url()).pathname.slice(0, 70)}`); });

 let status = 0;
 let interactions: Interaction[] = [];
 const problems: string[] = [];
 const warnings: string[] = [];
 let grid: GridShape | null = null, state = { overlayVisible: false, blockers: 0, blockerNote: [] as string[], bodyText: 0, soldVisible: 0, addButtons: 0, checkoutLinks: 0 };
 try {
  const resp = await page.goto(`http://${host}:${PORT}${pathName}`, { waitUntil: "load", timeout: 60000 });
  status = resp?.status() ?? 0;
  await page.waitForTimeout(2500);
  await scrollThrough(page);
  grid = (await page.evaluate(MEASURE)) as GridShape;
  state = (await page.evaluate(PAGE_STATE)) as typeof state;
  fs.mkdirSync(path.join(OUT, host.split(".")[0]), { recursive: true });
  await page.screenshot({ path: path.join(OUT, host.split(".")[0], `${pathName.replace(/\W+/g, "_") || "home"}.png`), fullPage: false });
  // Interactions run LAST: they click things, so anything measured after them would be measuring a
  // page with a drawer open rather than the page a shopper first sees.
  interactions = await drive(page, host, () => ({ fails: [...failedOwnOrigin], errs: [...vyaErrors] }));
 } catch (e) {
  problems.push(`NAVIGATION FAILED: ${String((e as Error).message).slice(0, 120)}`);
 } finally {
  await page.close();
 }

 const sourceGrid = sourceUrl ? await measureSource(browser, sourceUrl) : null;

 // ── Verdicts. Each one exists because it caught a real bug that everything else missed. ──
 // BLOCKING = a shopper cannot use this page. WARN = real, but the shop still works. Keeping these
 // apart matters: the first version flagged third-party JS noise and Shopify beacons as failures,
 // so all 9 stores came back FAIL and the gate carried no information at all.
 if (status && status !== 200) problems.push(`HTTP ${status}`);
 if (state.overlayVisible) problems.push("a loading/transition overlay is still covering the page");
 if (state.blockers) problems.push(`${state.blockers} element(s) covering the page: ${state.blockerNote.join(" | ")}`);
 if (state.bodyText < 200) problems.push(`almost no visible text (${state.bodyText} chars) — page likely blank`);
 if (grid && grid.cards > 0 && grid.visible === 0) problems.push(`all ${grid.cards} product cards are INVISIBLE (opacity/display)`);
 if (grid && grid.cards > 0 && grid.imgs > 0 && grid.imgsLoaded === 0) problems.push(`no product image loaded (${grid.imgs} <img>, 0 with pixels)`);
 if (grid && grid.cards > 0 && grid.imgs === 0) problems.push("product cards contain no <img> at all");
 // perRow is INFORMATIONAL, never blocking. It is a function of how many products the page happens
 // to hold, not of layout: one store measured an identical 448px card width on both sides while
 // reporting 3-up vs 6-up, purely because the hosted collection had 8 products and the source had
 // 15. Card WIDTH is the layout signal; column count is not.
 if (grid && sourceGrid && sourceGrid.perRow > 0 && grid.perRow > 0 && Math.abs(grid.perRow - sourceGrid.perRow) >= 2) {
  warnings.push(`column count differs: ${grid.perRow}-up vs source ${sourceGrid.perRow}-up (check the screenshot)`);
 }
 // Column count can match while the cards are a quarter too wide — that reads as a different shop,
 // and a per-row-only check passed a page showing one product where the source shows four.
 if (grid && sourceGrid && sourceGrid.cardW > 0 && grid.cardW > 0 && Math.abs(grid.cardW - sourceGrid.cardW) / sourceGrid.cardW > 0.15) {
  problems.push(`card width drift: ${grid.cardW}px vs source ${sourceGrid.cardW}px (${Math.round((grid.cardW / sourceGrid.cardW - 1) * 100)}%)`);
 }
 if (grid && sourceGrid && sourceGrid.cards > 0 && grid.cards > 0 && Math.abs(grid.cards - sourceGrid.cards) / sourceGrid.cards > 0.2) {
  warnings.push(`shows ${grid.cards} products, source shows ${sourceGrid.cards}`);
 }
 if (grid && grid.imgs > 0 && grid.imgsLoaded < grid.imgs) warnings.push(`${grid.imgs - grid.imgsLoaded} image(s) never loaded`);
 // An endpoint that only 404s once a shopper opens the drawer or types in search is exactly the
 // per-store gap a page load cannot see. Reported separately from load-time failures so the two are
 // never confused: these are the ones nothing in this repo was measuring before.
 for (const it of interactions) {
  // A buy button that does not move the cart is the one interaction failure that costs money.
  if (it.name === "add to cart" && it.performed && it.effect.startsWith("✗")) problems.push(`add to cart does nothing: ${it.effect.slice(2)}`);
  if (it.name === "add to cart" && it.performed && it.effect.startsWith("BLOCKED")) problems.push(`a shopper cannot click add to cart — ${it.effect}`);
  if (it.newFailures.length) warnings.push(`"${it.name}" triggered ${it.newFailures.length} unanswered request(s): ${[...new Set(it.newFailures)].slice(0, 3).join(" | ")}`);
  if (it.newErrors.length) warnings.push(`"${it.name}" triggered ${it.newErrors.length} JS error(s)`);
 }
 if (vyaErrors.length) warnings.push(`${vyaErrors.length} JS error(s) not attributable to a third party`);
 if (foreignRequests.length) warnings.push(`${foreignRequests.length} request(s) to Shopify-owned hosts`);
 // NOT a verdict: on Plan B the theme keeps its OWN add-to-cart, so [data-vya-add] is absent by
 // design. Counting its absence as breakage reported "0 add-to-cart" on all 18 pages, which is
 // noise, not a finding.

 return { pathName, status, ok: problems.length === 0, grid, sourceGrid, ...state, vyaErrors, foreignErrors, failedOwnOrigin, foreignRequests, problems, warnings, interactions };
}

async function verify(browser: Browser, slug: string) {
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
 // The homepage plus the capture with the most product links — that store's real grid page.
 const [busiest] = await sql`
  SELECT path, source_url FROM site_captures WHERE store_slug = ${slug}
  ORDER BY (length(html) - length(replace(html, '/products/', ''))) DESC LIMIT 1` as { path: string; source_url: string }[];
 const [home] = await sql`SELECT source_url FROM site_captures WHERE store_slug = ${slug} AND path = '/'` as { source_url: string }[];
 const host = `${slug}.${SUFFIX}`;
 const targets: [string, string | null][] = [["/", home?.source_url ?? null]];
 if (busiest && busiest.path !== "/") targets.push([busiest.path, busiest.source_url ?? null]);
 // A PRODUCT page too: it is the only place the theme's real add-to-cart form exists, and the
 // add-to-cart -> cart drawer path is the whole commerce bridge. Collection pages exercise none of
 // it — quick-add simply does not exist in most themes.
 const [prod] = await sql`
  SELECT i.source_id FROM items i JOIN sellers s ON s.id = i.seller_id
  WHERE s.slug = ${slug} AND i.status = 'active' AND i.source_id IS NOT NULL LIMIT 1` as { source_id: string }[];
 if (prod?.source_id) targets.push([`/products/${prod.source_id}`, null]);
 else console.log(`  (${slug}: no ACTIVE product with a source id — add-to-cart is only exercised on whatever product page the crawl captured, which may be sold)`);

 const pages: PageReport[] = [];
 for (const [p, src] of targets) pages.push(await checkPage(browser, host, p, src));
 const failed = pages.filter((p) => !p.ok);

 console.log(`\n━━ ${slug} ${failed.length ? "FAIL" : "PASS"}`);
 for (const p of pages) {
  const g = p.grid, s = p.sourceGrid;
  console.log(`  ${p.pathName}  [HTTP ${p.status}]`);
  console.log(`     cards ${g?.visible ?? "?"}/${g?.cards ?? "?"} visible · imgs ${g?.imgsLoaded ?? "?"}/${g?.imgs ?? "?"} loaded · ${g?.perRow ?? "?"}-up @${g?.cardW ?? "?"}px` +
   (s ? `  |  SOURCE ${s.perRow}-up @${s.cardW}px` : "  |  source not compared"));
  console.log(`     text ${p.bodyText} · "Sold out" ${p.soldVisible} · add-to-cart ${p.addButtons} · overlay ${p.overlayVisible}`);
  console.log(`     JS errors: ours ${p.vyaErrors.length}, third-party ${p.foreignErrors.length} · own-origin failures ${p.failedOwnOrigin.length} · Shopify requests ${p.foreignRequests.length}`);
  const perf = p.interactions.filter((i) => i.performed).length;
  console.log(`     interactions: ${perf}/${p.interactions.length} performed — ` +
   p.interactions.map((i) => `${i.name}: ${i.performed ? i.effect : "NOT FOUND"}`).join(" · "));
  for (const x of p.problems) console.log(`     ✗ BLOCKING: ${x}`);
  for (const x of p.warnings) console.log(`     ⚠ ${x}`);
  for (const e of p.vyaErrors.slice(0, 3)) console.log(`       · ${e}`);
  for (const f of [...new Set(p.failedOwnOrigin)].slice(0, 4)) console.log(`       · ${f}`);
  for (const f of [...new Set(p.foreignRequests)].slice(0, 3)) console.log(`       · foreign: ${f}`);
 }
 fs.mkdirSync(path.join(OUT, slug), { recursive: true });
 fs.writeFileSync(path.join(OUT, slug, "report.json"), JSON.stringify({ slug, pages }, null, 1));
 return failed.length === 0;
}

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (!slugs.length) { console.error("usage: verify-store.mts <slug> [...slugs]"); process.exit(2); }
const browser = await chromium.launch({ args: ["--run-all-compositor-stages-before-draw"] });
let allOk = true;
for (const s of slugs) { try { allOk = (await verify(browser, s)) && allOk; } catch (e) { console.log(`\n━━ ${s} ERROR: ${String((e as Error).message).slice(0, 160)}`); allOk = false; } }
await browser.close();
console.log(`\n${allOk ? "ALL PASS" : "FAILURES PRESENT"}`);
process.exit(allOk ? 0 : 1);
