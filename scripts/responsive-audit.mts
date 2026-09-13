/**
 * Does every Store OS page actually fit a phone and an iPad?
 *
 *   node --experimental-strip-types scripts/responsive-audit.mts [--only /admin/home,/admin/inventory] [--widths 390,768] [--shots]
 *
 * Needs `npm run dev` (3000, for the dev-login cookie) and `npm run dev:os` (3333, the Store OS).
 *
 * Why this exists next to mobile-audit.mts: that script reported ZERO overflow on every Store OS
 * page while the pages were visibly cut off at the right edge. The admin shell wraps everything in
 * `overflow-x: clip` (layout.tsx), and mobile-audit treats any clipping ancestor as a legitimate
 * container — so content sliced off by the shell was scored as "contained". Here a clipper that is
 * as wide as the viewport counts AS the viewport, which is what it is to the person holding the phone.
 *
 * Reports three different things, because they need different fixes:
 *   overflow — sticks out past the right edge of the screen and is cut off (the screenshots' bug)
 *   clipped  — cut off by a card/panel with overflow:hidden (table columns vanishing inside a card)
 *   hscroll  — a scroll container wider than its box: fine for a data table, wrong for a page
 */
import { chromium, type BrowserContext } from "playwright";
import fs from "node:fs";

const args = process.argv.slice(2);
const arg = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const MKT = `http://localhost:${arg("--port", "3000")}`;
const OS = `http://localhost:${arg("--port-os", "3333")}`;
const ONLY = arg("--only", "");
const SHOTS = args.includes("--shots");
const FULL = args.includes("--full"); // full-page screenshots — a viewport shot hides everything below the fold
const OUT = arg("--out", ".verify/responsive");
const CONCURRENCY = Number(arg("--concurrency", "4"));

const ALL_VIEWPORTS = [
 { name: "360", width: 360, height: 740, touch: true },   // small Android
 { name: "390", width: 390, height: 844, touch: true },   // iPhone 15
 { name: "430", width: 430, height: 932, touch: true },   // Pro Max — the user's screenshots
 { name: "768", width: 768, height: 1024, touch: true },  // iPad portrait: sidebar appears, 540px left
 { name: "1024", width: 1024, height: 768, touch: true }, // iPad landscape
];
const WIDTHS = arg("--widths", "");
const VIEWPORTS = WIDTHS ? ALL_VIEWPORTS.filter((v) => WIDTHS.split(",").includes(v.name)) : ALL_VIEWPORTS;

const MEASURE = () => {
 const VW = document.documentElement.clientWidth;
 const path = (el: Element): string => {
  const bits: string[] = [];
  let n: Element | null = el;
  for (let i = 0; n && i < 4; i++, n = n.parentElement) {
   let s = n.tagName.toLowerCase();
   if (n.id) { bits.unshift(`${s}#${n.id}`); break; }
   const cls = (typeof n.className === "string" ? n.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 4).join(".");
   if (cls) s += "." + cls;
   bits.unshift(s);
  }
  return bits.join(" > ").slice(0, 260);
 };
 const shown = (el: Element) => {
  const e = el as Element & { checkVisibility?: (o: object) => boolean };
  if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
 };
 // A clipper as wide as the screen IS the screen, as far as a reader is concerned.
 const pageWide = (p: Element) => { const r = p.getBoundingClientRect(); return r.left <= 1 && r.width >= VW - 2; };
 const container = (el: Element) => {
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
   const s = getComputedStyle(p);
   if (s.position === "fixed") return { p, kind: "fixed" as const, s };
   // Only a CLIPPING page-wide box stands in for the screen. A full-bleed scroller (`-mx-6 overflow-x-auto`
   // tab strip) holds its tabs past the edge on purpose — it scrolls, nothing is lost.
   if (s.overflowX !== "visible") return { p, kind: pageWide(p) && (s.overflowX === "hidden" || s.overflowX === "clip") ? ("page" as const) : ("box" as const), s };
  }
  return { p: null, kind: "page" as const, s: null };
 };
 // Off-canvas drawers, closed sheets and carousels park content outside on purpose.
 const inOffCanvas = (el: Element) => {
  for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
   const s = getComputedStyle(p);
   if (s.position === "fixed") { const r = p.getBoundingClientRect(); if (r.right <= 1 || r.left >= VW - 1) return true; }
   if (s.transform !== "none" && p !== el && /translate|matrix/.test(s.transform)) {
    const r = p.getBoundingClientRect(); if (r.right <= 1 || r.left >= VW - 1) return true;
   }
  }
  return false;
 };
 const hasText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0);
 const MEDIA = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "PICTURE", "PATH", "IFRAME"]);

 const overflow: { sel: string; over: number; w: number; txt: string }[] = [];
 const clipped: { sel: string; over: number; box: string; txt: string }[] = [];
 for (const el of document.querySelectorAll("body *")) {
  if (MEDIA.has(el.tagName.toUpperCase()) || el.closest("svg")) continue;
  if (!shown(el)) continue;
  const r = el.getBoundingClientRect();
  const c = container(el);
  if (c.kind === "fixed" && getComputedStyle(c.p!).overflowX === "visible") {
   // Fixed things (sheets, popovers) must still fit the screen.
   if (r.right > VW + 1 && r.left < VW && !inOffCanvas(el)) overflow.push({ sel: path(el), over: Math.round(r.right - VW), w: Math.round(r.width), txt: (el.textContent || "").trim().slice(0, 40) });
   continue;
  }
  if (c.kind === "page" || c.kind === "fixed") {
   if (r.right > VW + 1 && r.left < VW - 1 && !inOffCanvas(el)) overflow.push({ sel: path(el), over: Math.round(r.right - VW), w: Math.round(r.width), txt: (el.textContent || "").trim().slice(0, 40) });
   continue;
  }
  // Inside a narrower box. Scroll boxes are allowed to hold wide content (reported below); a
  // hidden/clip box that slices off text or a control is a defect — unless it is an ellipsis.
  const s = c.s!;
  if (s.overflowX === "auto" || s.overflowX === "scroll") continue;
  if (s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none") continue;
  const pr = c.p!.getBoundingClientRect();
  if (r.right > pr.right + 2 && r.left < pr.right - 1 && (hasText(el) || el.matches("button,a[href],input,select,textarea")) && !inOffCanvas(el)) {
   clipped.push({ sel: path(el), over: Math.round(r.right - pr.right), box: path(c.p!).split(" > ").pop() || "", txt: (el.textContent || "").trim().slice(0, 40) });
  }
 }
 const outermost = <T extends { sel: string; over: number }>(list: T[]) =>
  list.filter((o) => !list.some((b) => b !== o && o.sel.startsWith(b.sel) && b.over >= o.over)).sort((a, b) => b.over - a.over);

 const hscroll = [...document.querySelectorAll("body *")].filter((el) => {
  const s = getComputedStyle(el);
  if (s.overflowX !== "auto" && s.overflowX !== "scroll") return false;
  if (!shown(el) || inOffCanvas(el)) return false;
  return el.scrollWidth > el.clientWidth + 2;
 }).map((el) => ({ sel: path(el), content: el.scrollWidth, box: el.clientWidth, table: !!el.querySelector("table") }));

 const o = outermost(overflow), cl = outermost(clipped);
 return {
  vw: VW,
  loading: /^(Loading…|Redirecting…)$/.test((document.body.innerText || "").trim()),
  counts: { overflow: o.length, clipped: cl.length, hscroll: hscroll.length, maxOver: o[0]?.over ?? 0 },
  overflow: o.slice(0, 10), clipped: cl.slice(0, 10), hscroll: hscroll.slice(0, 8),
 };
};

const ROUTES = `/admin/home /admin/add-listing /admin/ai /admin/appointments /admin/apps /admin/apps/email /admin/billing
/admin/bulk-upload /admin/consignment /admin/consignment/consignors /admin/consignment/payouts /admin/consignment/settings
/admin/cross-listing /admin/cross-listing/analytics /admin/cross-listing/settings /admin/customers /admin/customers/buyers
/admin/customers/recovery /admin/dashboard /admin/dashboard/profit /admin/discounts /admin/flyers /admin/golden-review
/admin/import /admin/inbox /admin/instagram /admin/inventory /admin/inventory/collections /admin/inventory/drafts
/admin/inventory/sold /admin/market /admin/market/bring /admin/market/bring-list /admin/market/cart /admin/market/find
/admin/market/inventory /admin/market/quick /admin/market/sales /admin/market/setup /admin/marketing /admin/marketing/audience
/admin/marketing/campaigns /admin/marketing/campaigns/compose /admin/marketing/design /admin/marketing/email
/admin/marketing/emails /admin/marketing/esp /admin/marketing/instagram /admin/marketing/share-links /admin/onboarding
/admin/onboarding/build /admin/orders /admin/payments /admin/performance /admin/recovery /admin/rentals /admin/settings
/admin/settings/activity /admin/settings/appointments /admin/settings/consignment /admin/settings/details /admin/settings/domain
/admin/settings/general /admin/settings/inbox /admin/settings/invites /admin/settings/locations /admin/settings/marketplaces
/admin/settings/notifications /admin/settings/payments /admin/settings/plan /admin/settings/policies /admin/settings/rentals
/admin/settings/shipping /admin/settings/tax /admin/settings/users /admin/setup-funnel /admin/storefront
/admin/storefront/domain /admin/storefront/versions /admin/trends`.split(/\s+/).filter(Boolean);

/** Dynamic routes, resolved by scraping a real link off their index page. */
const DISCOVER = [
 { from: "/admin/orders", re: "^/admin/orders/[^/]+$" },
 { from: "/admin/customers", re: "^/admin/customers/(?!buyers|recovery)[^/]+$" },
 { from: "/admin/market/inventory", re: "^/admin/market/item/[^/]+$" },
 { from: "/admin/market/sales", re: "^/admin/market/summary/[^/]+$" },
];

const settle = async (page: import("playwright").Page) => {
 await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
 await page.waitForFunction(() => !/^(Loading…)$/.test((document.body.innerText || "").trim()), null, { timeout: 15000 }).catch(() => {});
 await page.waitForTimeout(900);
};

const run = async () => {
 const res = await fetch(`${MKT}/api/admin/dev-login?to=/`, { redirect: "manual" });
 const tok = (res.headers.getSetCookie?.() ?? []).map((c) => /^via_admin_token=([^;]+)/.exec(c)?.[1]).find(Boolean);
 if (!tok) throw new Error("dev-login did not set a token — is `npm run dev` up on 3000?");
 const browser = await chromium.launch();
 const mk = async (touch: boolean): Promise<BrowserContext> => {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, isMobile: touch, hasTouch: touch, viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "via_admin_token", value: tok, domain: "localhost", path: "/" }]);
  return ctx;
 };
 const ctx = await mk(true);

 const routes = ONLY ? ONLY.split(",") : [...ROUTES];
 if (!ONLY) {
  const probe = await ctx.newPage();
  await probe.setViewportSize({ width: 1280, height: 900 });
  for (const d of DISCOVER) {
   try {
    await probe.goto(OS + d.from, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(probe);
    const href = await probe.evaluate((src: string) => [...document.querySelectorAll("a[href]")]
     .map((a) => new URL((a as HTMLAnchorElement).href).pathname).find((h) => new RegExp(src).test(h)) || null, d.re);
    if (href) routes.push(href); else console.log(`  (no link matching ${d.re} on ${d.from})`);
   } catch (e) { console.log(`  !! ${d.from}: ${(e as Error).message.split("\n")[0]}`); }
  }
  await probe.close();
 }

 fs.mkdirSync(OUT, { recursive: true });
 const results: Record<string, Record<string, unknown>> = {};
 const jobs = routes.flatMap((r) => VIEWPORTS.map((vp) => ({ r, vp })));
 let next = 0;
 const worker = async () => {
  while (next < jobs.length) {
   const { r, vp } = jobs[next++];
   const page = await ctx.newPage();
   await page.setViewportSize({ width: vp.width, height: vp.height });
   try {
    const resp = await page.goto(OS + r, { waitUntil: "domcontentloaded", timeout: 90000 });
    await settle(page);
    const m = await page.evaluate(MEASURE);
    const landed = new URL(page.url()).pathname;
    (results[r] ??= {})[vp.name] = { ...m, status: resp?.status(), landed };
    if (SHOTS) await page.screenshot({ path: `${OUT}/${r.replace(/^\/admin\/?/, "").replace(/\//g, "_") || "root"}-${vp.name}.png`, fullPage: FULL });
    const c = m.counts;
    const bad = c.overflow || c.clipped;
    console.log(`${bad ? "✗" : "✓"} ${r} @${vp.name}${landed !== r ? ` →${landed}` : ""}${m.loading ? " [LOADING]" : ""} overflow:${c.overflow}${c.maxOver ? `(${c.maxOver}px)` : ""} clipped:${c.clipped} hscroll:${c.hscroll}`);
   } catch (e) {
    (results[r] ??= {})[vp.name] = { error: (e as Error).message.split("\n")[0] };
    console.log(`! ${r} @${vp.name} ERROR ${(e as Error).message.split("\n")[0]}`);
   }
   await page.close();
  }
 };
 await Promise.all(Array.from({ length: CONCURRENCY }, worker));
 await browser.close();
 fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
 console.log(`\nwrote ${OUT}/results.json`);
};

await run();
