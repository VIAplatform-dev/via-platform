/**
 * Does the cart actually work — on every store, in a real browser?
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/verify-carts.mts
 *   …--store lamash          one store
 *   …--headed                watch it happen
 *   …--base http://localhost:3333
 *
 * WHY THIS EXISTS. Every cart bug this week reached the user because verification was one store, by
 * hand, in a browser — and then generalised from. An HTTP check is not enough either: the worst bug
 * (a drawer that opened empty) was served as PERFECTLY CORRECT HTML and broke inside the theme's own
 * JavaScript. Only a real browser, clicking the theme's own buttons, can see that class of failure.
 *
 * It drives the SYSTEM Chrome (channel: "chrome"), so nothing is downloaded, and maps every store
 * hostname to localhost itself, so no /etc/hosts entry is needed for any of the 21 stores.
 *
 * READ-ONLY against the database: it only browses, adds to a throwaway cart, and removes again.
 */
import { chromium, type Browser, type Page } from "playwright";
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const arg = (name: string): string | null => {
 const i = process.argv.indexOf(`--${name}`);
 return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
};
const BASE = (arg("base") || "http://localhost:3333").replace(/\/+$/, "");
const PORT = new URL(BASE).port || "80";
const SUFFIX = (process.env.STORE_HOST_SUFFIX || "vyasites.test").replace(/^\./, "");
const ONLY = arg("store");
const HEADED = process.argv.includes("--headed");

/* eslint-disable @typescript-eslint/no-explicit-any */

type Step = "home" | "pdp" | "add" | "drawer" | "cart" | "remove" | "checkout";
const STEPS: Step[] = ["home", "pdp", "add", "drawer", "cart", "remove", "checkout"];
type Result = { store: string; status: Partial<Record<Step, "pass" | "fail" | "skip">>; notes: string[]; errors: string[] };

// ── Selectors ────────────────────────────────────────────────────────────────────────────────────
// Every one is used with `>> visible=true`. A page can carry the same control several times — a
// hidden sticky-bar copy, a template, a mobile duplicate — and clicking `.first()` found a 0x0
// invisible one and reported perfectly working stores as broken for an entire run.
// Deliberately broad and theme-agnostic: this harness must not encode the per-theme knowledge whose
// absence it exists to detect. If a store fails only because a selector missed, that is itself worth
// knowing — it means a shopper's browser would struggle to find the control too.
const SEL = {
 productLink: 'a[href*="/products/"]',
 addToCart: [
  // VYA owns the buy path now, so its button is the one a shopper reaches. The theme's own control
  // is listed after it purely so a store that somehow still has one is still exercised.
  '[data-vya-add]',
  'form[action*="/cart/add"] button[type="submit"]',
  'button[name="add"]',
  'button:has-text("Add to cart")',
  'button:has-text("Add to bag")',
 ].join(", "),
 cartIcon: [
  '#vya-cart-btn',
  '[data-vya-cart-open]',
  'a[href="/cart"]',
  'a[href$="/cart"]',
  '[class*="cart-icon"]',
  'button[aria-label*="cart" i]',
  'a[aria-label*="cart" i]',
  'summary[aria-label*="cart" i]',
 ].join(", "),
 cartPanel: '#vya-cart-drawer, #CartDrawer, cart-drawer, .cart-drawer, cart-drawer-component, [class*="cart-drawer"], dialog[class*="cart"]',
 removeControl: '[data-vya-remove], [data-vya-cart-remove], cart-remove-button, [aria-label*="remove" i], [class*="cart-remove"]',
 checkout: '[data-vya-checkout], [name="checkout"], a[href*="/checkout"]',
};

/** What the SERVER says is in the bag — the source of truth every surface is checked against. */
async function serverCart(page: Page): Promise<{ count: number; titles: string[] }> {
 return page.evaluate(async () => {
  const r = await fetch("/cart.js", { headers: { Accept: "application/json" } });
  const j = await r.json();
  return { count: j.item_count ?? 0, titles: (j.items || []).map((i: any) => String(i.title || "")) };
 });
}

/**
 * Wait for the SERVER's cart to reach a state, rather than sleeping and hoping.
 *
 * Fixed waits are why this harness reported working stores as broken: a theme animates its drawer,
 * then fetches, then reloads, and 2.5 seconds is sometimes enough and sometimes not. Three stores
 * the user checked by hand were fine while this said they were not.
 */
async function waitForCart(page: Page, ok: (c: { count: number; titles: string[] }) => boolean, ms = 12000): Promise<{ count: number; titles: string[] }> {
 const deadline = Date.now() + ms;
 let last = { count: -1, titles: [] as string[] };
 while (Date.now() < deadline) {
  last = await serverCart(page).catch(() => last);
  if (ok(last)) return last;
  await page.waitForTimeout(400);
 }
 return last;
}

/**
 * The text a shopper can actually READ in any visible cart region.
 *
 * Deliberately not a per-row parse. Every theme — and VYA's own drawer — marks a cart line up
 * differently, and three separate attempts to extract "the title element" produced false failures on
 * stores whose carts were working perfectly. Containment is what a shopper actually experiences: is
 * the thing I added written on the screen?
 */
async function visibleCartText(page: Page): Promise<string> {
 return page.evaluate((panelSel) => {
  const parts: string[] = [];
  // `[data-vya-fallback-cart]` is VYA'S OWN cart page — the one served when the captured theme has
  // no cart region we can fill. It was missing from this list, so on a store that gets it (awoke-
  // vintage) the only regions matched were the drawer's EMPTY containers, and a cart page plainly
  // reading "Awoke Tote · Remove · $18.00 · Subtotal $18.00" was reported as not showing the item.
  for (const root of document.querySelectorAll(`${panelSel}, [data-vya-fallback-cart], #vya-cart-items, [id*="cart" i][class*="items" i], [class*="cart-items"], [id="main-cart-items"]`)) {
   const s = getComputedStyle(root as Element);
   const r = (root as HTMLElement).getBoundingClientRect();
   if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.1) continue;
   if (r.width < 40 || r.height < 20) continue;
   parts.push((root.textContent || "").replace(/\s+/g, " ").trim());
  }
  return parts.join(" ⁞ ");
 }, SEL.cartPanel);
}

/** How many cart panels are visible at once. Two means the theme's own drawer opened over ours. */
async function visiblePanels(page: Page): Promise<number> {
 return page.evaluate((sel) => {
  let n = 0;
  for (const el of document.querySelectorAll(sel)) {
   const r = (el as HTMLElement).getBoundingClientRect();
   const s = getComputedStyle(el as Element);
   if (r.width > 120 && r.height > 120 && s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.1) n++;
  }
  return n;
 }, SEL.cartPanel);
}

/**
 * Click the first copy of a control that a SHOPPER could actually click.
 *
 * `.first()` is not that. Themes ship the same control more than once, and the extra copy is
 * routinely a STICKY add-to-cart bar that sits outside the viewport until the theme reveals it on
 * scroll — and it comes FIRST in DOM order. Playwright scrolls, finds it still outside the viewport,
 * retries until it times out, and the store is reported broken while its real button, three hundred
 * pixels up the same page, works perfectly.
 *
 * That is what "timed out — the page never settled" was on tesselizabethvintage: six candidate
 * products, each costing an 8s click timeout plus a 10s wait for a cart that could never fill,
 * against a 90s per-store budget. Her cart was fine the whole time — clicking the in-page button
 * puts the piece in the bag in 0.8s.
 *
 * So try every visible copy and keep the first that accepts a click. No per-theme knowledge, which
 * is the rule this harness is written to.
 */
async function clickAnyClickable(page: Page, selector: string, timeout = 4000): Promise<boolean> {
 const all = page.locator(`${selector} >> visible=true`);
 const n = await all.count();
 for (let i = 0; i < n; i++) {
  try { await all.nth(i).click({ timeout }); return true; } catch { /* a copy that can't be reached — try the next */ }
 }
 return false;
}

async function runStore(browser: Browser, slug: string): Promise<Result> {
 const res: Result = { store: slug, status: {}, notes: [], errors: [] };
 const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
 const page = await ctx.newPage();
 page.on("console", (m) => { if (m.type() === "error") res.errors.push(m.text().slice(0, 160)); });
 page.on("pageerror", (e) => {
  // The FILE that threw matters more than the message: a script crashing early takes the theme's
  // own cart handlers down with it, and the shopper just sees a button that does nothing.
  const frame = (String(e.stack || "").split("\n").find((l) => l.includes("http")) || "").trim().slice(0, 110);
  res.errors.push(`pageerror: ${String(e.message).slice(0, 90)}${frame ? ` @ ${frame}` : ""}`);
 });
 // Which request failed matters more than that one did: a 405 or 404 names the route the theme
 // expected us to answer, which is exactly the per-theme contract we keep discovering by accident.
 page.on("response", (r) => {
  if (r.status() < 400) return;
  const u = new URL(r.url());
  res.errors.push(`${r.status()} ${r.request().method()} ${u.pathname}${u.search.slice(0, 40)}`);
 });

 const origin = `http://${slug}.${SUFFIX}:${PORT}`;
 const fail = (s: Step, why: string) => { res.status[s] = "fail"; res.notes.push(`${s}: ${why}`); };

 try {
  // ── home ───────────────────────────────────────────────────────────────────────────────────────
  const home = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 15000 });
  if (!home || home.status() >= 400) { fail("home", `HTTP ${home?.status()}`); return res; }
  // Several candidates, not the first. Vintage stock is one-of-one and a third of a store's grid can
  // be sold — adding a sold piece correctly fails, and taking only the first link reported perfectly
  // working stores as broken.
  const links = [...new Set(await page.locator(SEL.productLink).evaluateAll((els) =>
   els.map((e) => (e as HTMLAnchorElement).getAttribute("href") || "").filter(Boolean)))].slice(0, 6);
  if (!links.length) { fail("home", "no product links on the storefront"); return res; }
  res.status.home = "pass";

  // ── product page + add, trying candidates until one is actually buyable ───────────────────────
  let link = links[0];
  let afterAdd = { count: 0, titles: [] as string[] };
  let sawPdp = false, sawButton = false;
  for (const candidate of links) {
   const pdp = await page.goto(new URL(candidate, origin).toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
   if (!pdp || pdp.status() >= 400) continue;
   sawPdp = true;
   if (!(await page.locator(`${SEL.addToCart} >> visible=true`).count())) continue;
   sawButton = true;
   await clickAnyClickable(page, SEL.addToCart);
   const cart = await waitForCart(page, (c) => c.count >= 1, 10000);
   if (cart.count >= 1) { link = candidate; afterAdd = cart; break; }
  }
  if (!sawPdp) { fail("pdp", "no product page loaded"); return res; }
  res.status.pdp = "pass";
  if (!sawButton) { fail("pdp", "no visible Add-to-cart control on any product page"); return res; }
  if (afterAdd.count < 1) { fail("add", `nothing could be added from ${links.length} product page(s) — all sold, or Add is dead`); return res; }
  res.status.add = "pass";
  const wanted = afterAdd.titles[0];

  // ── the drawer the Add opened, or the one the cart icon opens ──────────────────────────────────
  let shown = await visibleCartText(page);
  if (!shown.includes(wanted)) {
   // Same hazard as the Add button above: a theme's header cart icon often has an off-screen twin.
   if (await page.locator(`${SEL.cartIcon} >> visible=true`).count()) {
    await clickAnyClickable(page, SEL.cartIcon);
    await page.waitForTimeout(1800);
    shown = await visibleCartText(page);
   }
  }
  // Both carts opening at once is a real failure a shopper sees immediately — and one this harness
  // was blind to until the user found it on two Squarespace stores.
  const panels = await visiblePanels(page);
  if (!shown.includes(wanted)) fail("drawer", `bag holds "${wanted}" but the open cart reads ${shown ? `"${shown.slice(0, 70)}…"` : "empty"}`);
  else if (panels > 1) fail("drawer", `${panels} cart panels visible at once — the theme's own drawer is open too`);
  else res.status.drawer = "pass";

  // ── the cart page ──────────────────────────────────────────────────────────────────────────────
  await page.goto(`${origin}/cart`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(1200);
  const onPage = await visibleCartText(page);
  const server = await serverCart(page);
  const missing = server.titles.filter((t) => !onPage.includes(t));
  if (missing.length) fail("cart", `bag holds ${JSON.stringify(missing)} but the cart page does not show it`);
  else res.status.cart = "pass";

  // ── remove ─────────────────────────────────────────────────────────────────────────────────────
  if (!(await page.locator(`${SEL.removeControl} >> visible=true`).count())) fail("remove", "no remove control on the cart page");
  else {
   await clickAnyClickable(page, SEL.removeControl);
   const after = await waitForCart(page, (c) => c.count === 0, 12000);
   if (after.count !== 0) fail("remove", `still ${after.count} item(s) in the bag after pressing remove`);
   else res.status.remove = "pass";
  }

  // ── checkout ───────────────────────────────────────────────────────────────────────────────────
  // Re-add, because remove emptied the bag and an empty bag cannot check out.
  //
  // Removing triggers the cart page's own location.reload(); navigating while that is still in
  // flight aborts it, and the whole checkout step was being recorded as a throw on stores where
  // everything worked. Let the page settle first, and treat an aborted navigation as retryable.
  await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
  const gotoPdp = async () => page.goto(new URL(link, origin).toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
  await gotoPdp().catch(async () => { await page.waitForTimeout(1200); return gotoPdp().catch(() => null); });
  // clickAnyClickable, not `.first()`, for the reason given on that helper: `.first()` is the
  // theme's off-screen sticky bar, so this re-add silently did nothing, the bag stayed empty, and
  // the cart page then correctly showed no checkout control — reported as "no checkout control on
  // the cart page" on a store whose checkout was fine.
  await clickAnyClickable(page, SEL.addToCart);
  await page.waitForTimeout(2000);
  await page.goto(`${origin}/cart`, { waitUntil: "domcontentloaded", timeout: 15000 });
  const co = page.locator(`${SEL.checkout} >> visible=true`).first();
  if (!(await co.count())) fail("checkout", "no checkout control on the cart page");
  else {
   await co.click({ timeout: 8000 }).catch(() => {});
   await page.waitForURL(/\/checkout/, { timeout: 8000 }).catch(() => {});
   if (/\/checkout/.test(page.url())) res.status.checkout = "pass";
   else fail("checkout", `pressing Check out stayed on ${page.url().replace(origin, "") || "/"}`);
  }
 } catch (e) {
  res.notes.push(`threw: ${String((e as Error).message).slice(0, 140)}`);
 } finally {
  await ctx.close().catch(() => {});
 }
 return res;
}

async function main() {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) { console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local …"); process.exit(1); }
 const sql = neon(dbUrl);

 // Only stores that can actually sell: captured pages AND a seller record. A store without a seller
 // answers "Unknown store." to every cart call, which is a different (already known) problem.
 const rows = (await sql`
  SELECT c.store_slug FROM (SELECT DISTINCT store_slug FROM site_captures) c
  JOIN sellers s ON s.slug = c.store_slug ORDER BY c.store_slug
 `) as { store_slug: string }[];
 const stores = (ONLY ? rows.filter((r) => r.store_slug === ONLY) : rows).map((r) => r.store_slug);
 if (!stores.length) { console.error(ONLY ? `No captured store called "${ONLY}".` : "No captured stores with a seller record."); process.exit(1); }

 console.log(`\nDriving Chrome against ${BASE} — ${stores.length} store(s)\n`);
 const browser = await chromium.launch({
  channel: "chrome", // the Chrome already on this machine: nothing to download
  headless: !HEADED,
  // Every {slug}.vyasites.test resolves here, so no /etc/hosts entry is needed for any store.
  args: [`--host-resolver-rules=MAP *.${SUFFIX} 127.0.0.1`],
 });

 const results: Result[] = [];
 // Progress is written to disk as it happens: a run piped into another command buffers its output
 // until it exits, which on a 22-store sweep means staring at nothing for minutes.
 const LOG = "/tmp/verify-carts-progress.txt";
 fs.writeFileSync(LOG, `started ${stores.length} stores\n`);

 for (const slug of stores) {
  // A HARD CAP per store. One page that never settles (a theme stuck in a fetch loop will do it)
  // must cost this run ninety seconds, not all of it.
  const capped = await Promise.race([
   runStore(browser, slug),
   new Promise<Result>((resolve) => setTimeout(
    () => resolve({ store: slug, status: {}, notes: ["timed out — the page never settled"], errors: [] }),
    90000,
   )),
  ]);
  results.push(capped);
  const line = `  ${slug.padEnd(28)}${STEPS.map((s) => (capped.status[s] === "pass" ? "PASS" : capped.status[s] === "fail" ? "FAIL" : "  - ").padEnd(6)).join("")}${capped.notes[0] ? ` ${capped.notes[0].slice(0, 60)}` : ""}`;
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
 }
 await browser.close();

 console.log(`\n${"STORE".padEnd(28)} ${STEPS.map((s) => s.toUpperCase().slice(0, 8).padEnd(8)).join("")}`);
 console.log("-".repeat(28 + STEPS.length * 8));
 for (const r of results) {
  console.log(r.store.padEnd(28) + STEPS.map((s) => (r.status[s] === "pass" ? "pass" : r.status[s] === "fail" ? "FAIL" : "-").padEnd(8)).join(""));
 }

 const failing = results.filter((r) => STEPS.some((s) => r.status[s] === "fail") || r.notes.length);
 console.log(`\n${results.length - failing.length} of ${results.length} stores clean.\n`);
 for (const r of failing) {
  console.log(`${r.store}`);
  for (const n of r.notes) console.log(`   • ${n}`);
  for (const e of [...new Set(r.errors)].slice(0, 3)) console.log(`   ! console: ${e}`);
 }
 console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
