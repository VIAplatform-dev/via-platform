/**
 * What actually breaks on a phone.
 *
 *   node --experimental-strip-types scripts/mobile-audit.mts [--port 3333] [--only /browse,/cart] [--json out.json]
 *
 * Loads every route at real device widths in Chromium and MEASURES, rather than eyeballing a
 * screenshot. The site sets `overflow-x: hidden` on <body>, so the usual overflow test
 * (scrollWidth > clientWidth) reports zero everywhere while content is still being clipped off the
 * right edge. So this walks the box tree instead and asks which VISIBLE elements stick out past the
 * viewport without a real scroll container to live in — html/body are deliberately NOT counted as
 * clippers, because that global hidden is the thing under audit.
 *
 * Also counts what a phone user feels but a desktop reviewer never sees: tap targets under 44px,
 * inputs whose font-size is under 16px (iOS silently zooms the whole page on focus and never zooms
 * back), fixed bars that ignore the home indicator, and images shipped at desktop resolution.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";

const args = process.argv.slice(2);
const arg = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const PORT_MKT = arg("--port", "3000");
const PORT_OS = arg("--port-os", "3333");
const ONLY = arg("--only", "");
const JSON_OUT = arg("--json", ".verify/mobile-audit.json");

/**
 * Almost the whole marketplace is behind the pilot gate. `/api/admin/dev-login` is the project's
 * own localhost-only sign-in (it refuses outside NODE_ENV=development on a loopback host); the
 * admin token it sets satisfies the catch-all gate, so the audit sees real pages instead of 40
 * copies of the login screen. It does NOT satisfy isSessionOnlyRoute — /cart, /account/* and
 * /store/* still need a genuine shopper/seller session, and are reported as gated.
 */
const authCookie = async (): Promise<{ name: string; value: string; domain: string; path: string }[]> => {
 const res = await fetch(`http://localhost:${PORT_MKT}/api/admin/dev-login?to=/`, { redirect: "manual" });
 const raw = res.headers.getSetCookie?.() ?? [];
 const tok = raw.map((c) => /^via_admin_token=([^;]+)/.exec(c)?.[1]).find(Boolean);
 if (!tok) { console.log("!! dev-login did not set a token — auditing signed out"); return []; }
 return ["localhost"].map((domain) => ({ name: "via_admin_token", value: tok, domain, path: "/" }));
};

/** The widths that matter. Landscape is the same page with the axes swapped, so it gets its own row. */
const VIEWPORTS = [
 { name: "320", width: 320, height: 568 },   // iPhone SE 1 / smallest in real use
 { name: "360", width: 360, height: 740 },   // most common Android
 { name: "390", width: 390, height: 844 },   // iPhone 14/15/16
 { name: "430", width: 430, height: 932 },   // Pro Max
 { name: "768", width: 768, height: 1024 },  // tablet portrait
 { name: "land", width: 844, height: 390 },  // phone landscape: short viewport
];

/**
 * Runs inside the page. Everything it returns must be structured-cloneable, so elements are
 * reported as {selector, rect} rather than as nodes.
 */
const MEASURE = () => {
 const path = (el: Element): string => {
  const bits: string[] = [];
  let n: Element | null = el;
  for (let i = 0; n && i < 4; i++, n = n.parentElement) {
   let s = n.tagName.toLowerCase();
   if (n.id) { bits.unshift(`${s}#${n.id}`); break; }
   const cls = (typeof n.className === "string" ? n.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
   if (cls) s += "." + cls;
   bits.unshift(s);
  }
  return bits.join(" > ").slice(0, 200);
 };

 /**
  * Really on screen — not merely non-`display:none`.
  *
  * The first cut of this checked only the element's OWN opacity, and the header's collapsed nav
  * accordions (`max-height:0; opacity:0; overflow:hidden`) reported ~650 undersized tap targets on
  * every page: computed opacity is not inherited, so each hidden store link looked fully visible.
  * Two extra tests kill that whole class of false positive — ancestor opacity/visibility via
  * checkVisibility, and whether the box actually survives its nearest clipping ancestor.
  */
 const visible = (el: Element) => {
  const anyEl = el as Element & { checkVisibility?: (o: object) => boolean };
  if (typeof anyEl.checkVisibility === "function" &&
   !anyEl.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
  const s = getComputedStyle(el);
  if (s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) < 0.05) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  // A collapsed accordion still gives its children a normal rect; they are just clipped to nothing.
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
   const ps = getComputedStyle(p);
   if (ps.overflow === "visible" && ps.overflowX === "visible" && ps.overflowY === "visible") continue;
   const pr = p.getBoundingClientRect();
   if (pr.height < 1 || pr.width < 1) return false;
   const overlapY = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top);
   const overlapX = Math.min(r.right, pr.right) - Math.max(r.left, pr.left);
   // Horizontal scrollers legitimately hold children beyond their right edge, so only a vertical
   // miss (or a fully-outside box) counts as clipped away.
   if (overlapY < 1) return false;
   if (overlapX < 1 && ps.overflowX !== "auto" && ps.overflowX !== "scroll") return false;
  }
  return true;
 };

 const VW = document.documentElement.clientWidth;
 const all = [...document.querySelectorAll("body *")];

 // ---- horizontal overflow -------------------------------------------------
 // An element only truly overflows the PAGE if nothing between it and <body> can scroll or clip it.
 // A carousel with overflow-x:auto is intentional and must not be reported.
 // A clipper as wide as the screen is not a container, it is the screen: the Store OS shell has
 // `overflow-x: clip` on its root, and counting that as "contained" scored every cut-off Store OS page
 // as zero overflow (see scripts/responsive-audit.mts, which found them).
 const clipped = (el: Element) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
   const ox = getComputedStyle(p).overflowX;
   if (ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll") {
    const pr = p.getBoundingClientRect();
    if (pr.left <= 1 && pr.width >= VW - 2) continue;
    return true;
   }
  }
  return false;
 };
 const overflow = all
  .filter((el) => {
   if (!visible(el)) return false;
   const r = el.getBoundingClientRect();
   // 1px of tolerance for subpixel rounding; ignore things parked fully offscreen (closed drawers).
   if (r.right <= VW + 1) return false;
   if (r.left >= VW) return false;
   return !clipped(el);
  })
  .map((el) => {
   const r = el.getBoundingClientRect();
   return { sel: path(el), right: Math.round(r.right), width: Math.round(r.width), over: Math.round(r.right - VW) };
  })
  // The outermost offender is the cause; its children are symptoms.
  .filter((o, _i, arr) => !arr.some((b) => b !== o && o.sel.startsWith(b.sel) && b.over >= o.over))
  .sort((a, b) => b.over - a.over)
  .slice(0, 12);

 // ---- tap targets ---------------------------------------------------------
 const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], summary, [onclick]';
 const targets = [...document.querySelectorAll(INTERACTIVE)].filter(visible);
 const small = targets
  .filter((el) => {
   const r = el.getBoundingClientRect();
   // Inline links inside a paragraph are held to a different standard than standalone controls:
   // a link that wraps mid-sentence is legitimately text-height. Only flag inline links when they
   // are effectively a lone control on their line.
   const inlineInText = el.tagName === "A" && getComputedStyle(el).display.startsWith("inline") &&
    (el.parentElement?.textContent || "").trim().length > (el.textContent || "").trim().length + 12;
   if (inlineInText) return false;
   return r.width < 44 || r.height < 44;
  })
  .map((el) => {
   const r = el.getBoundingClientRect();
   return { sel: path(el), w: Math.round(r.width), h: Math.round(r.height), label: (el.textContent || "").trim().slice(0, 24) };
  })
  ;

 // Controls whose centres sit closer than 8px apart are a mis-tap waiting to happen.
 let crowded = 0;
 const boxes = targets.map((el) => el.getBoundingClientRect());
 for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
   const a = boxes[i], b = boxes[j];
   const gapX = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
   const gapY = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
   if (gapX < 8 && gapY < 8 && !(gapX === 0 && gapY === 0)) crowded++;
  }
 }

 // ---- iOS focus zoom ------------------------------------------------------
 // Safari zooms the page when a focused field's font-size is < 16px, and there is no way back
 // except pinching. This is the single most common "the form is unusable" bug on iPhone.
  // Mirror the exclusions in globals.css: zoom only happens on controls you TYPE into, so a range
 // slider or colour swatch with 11px type is not a defect (a range input reported one for two runs).
 const zoomers = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=submit]):not([type=button]), select, textarea")]
  .filter(visible)
  .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
  .map((el) => ({ sel: path(el), fs: getComputedStyle(el).fontSize, type: (el as HTMLInputElement).type || el.tagName.toLowerCase() }))
  .slice(0, 15);

 // Wrong keyboard: an email/tel/number field typed as plain text gives the user a QWERTY keyboard
 // and no autofill.
 const keyboards = [...document.querySelectorAll("input")]
  .filter(visible)
  .filter((el) => {
   const i = el as HTMLInputElement;
   const hint = `${i.name} ${i.id} ${i.placeholder} ${i.getAttribute("autocomplete") || ""}`.toLowerCase();
   if (i.type === "text" && /e-?mail/.test(hint)) return true;
   if (i.type === "text" && /phone|tel\b/.test(hint)) return true;
   if (i.type === "text" && /zip|postal|cvc|cvv|card ?number/.test(hint) && !i.inputMode) return true;
   return false;
  })
  .map((el) => ({ sel: path(el), type: (el as HTMLInputElement).type, name: (el as HTMLInputElement).name || (el as HTMLInputElement).placeholder }))
  .slice(0, 10);

 // ---- accessibility -------------------------------------------------------
 const named = (el: Element) =>
  (el.getAttribute("aria-label") || "").trim() ||
  (el.getAttribute("title") || "").trim() ||
  (el.textContent || "").trim() ||
  (el.querySelector("img[alt]")?.getAttribute("alt") || "").trim() ||
  (el.getAttribute("aria-labelledby") ? "ref" : "");
 const unlabelled = [...document.querySelectorAll('button, [role="button"], a[href]')]
  .filter(visible).filter((el) => !named(el))
  .map((el) => ({ sel: path(el), html: el.outerHTML.slice(0, 90) })).slice(0, 15);

 const imgsNoAlt = [...document.images].filter(visible)
  .filter((i) => !i.hasAttribute("alt"))
  .map((i) => ({ sel: path(i), src: (i.currentSrc || i.src).slice(-70) })).slice(0, 12);

 const inputsNoLabel = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
  .filter(visible)
  .filter((el) => {
   if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
   if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
   if (el.closest("label")) return false;
   return true;
  })
  .map((el) => ({ sel: path(el), ph: (el as HTMLInputElement).placeholder || "" })).slice(0, 12);

 // ---- typography ----------------------------------------------------------
 const tiny = all.filter((el) => {
  if (!visible(el)) return false;
  const t = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 3);
  if (!t) return false;
  return parseFloat(getComputedStyle(el).fontSize) < 12;
 }).map((el) => ({ sel: path(el), fs: getComputedStyle(el).fontSize, txt: (el.textContent || "").trim().slice(0, 30) }));

 // ---- fixed / sticky ------------------------------------------------------
 const pinned = all.filter((el) => {
  if (!visible(el)) return false;
  const p = getComputedStyle(el).position;
  return p === "fixed" || p === "sticky";
 }).map((el) => {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const usesSafeArea = /env\(|safe-area/.test(el.getAttribute("style") || "") ||
   /env\(|safe-area/.test(s.paddingBottom + s.bottom + s.paddingTop + s.top);
  return {
   sel: path(el), pos: s.position,
   top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
   atBottom: r.bottom >= innerHeight - 2, safeArea: usesSafeArea,
   // A bar taller than a third of a landscape viewport is eating the page.
   share: +(r.height / innerHeight).toFixed(2),
  };
 }).slice(0, 12);

 // ---- images --------------------------------------------------------------
 const heavy = [...document.images].filter(visible).filter((i) => {
  const r = i.getBoundingClientRect();
  // Shipping >2.5x the pixels actually displayed, at DPR 2, is wasted cellular data.
  return i.naturalWidth > 0 && r.width > 0 && i.naturalWidth > r.width * 2.5;
 }).map((i) => {
  const r = i.getBoundingClientRect();
  return { sel: path(i), nat: i.naturalWidth, shown: Math.round(r.width), src: (i.currentSrc || i.src).slice(-70) };
 }).slice(0, 12);

 const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0)
  .map((i) => ({ src: (i.currentSrc || i.src).slice(-70) })).slice(0, 8);

 // ---- viewport units ------------------------------------------------------
 // 100vh on a phone is taller than the visible page while the browser chrome is showing, so a
 // "full screen" panel hides its own bottom. dvh is the fix.
 const vhUsers = all.filter((el) => {
  const st = el.getAttribute("style") || "";
  return /\b\d+vh\b/.test(st) || /\b100vw\b/.test(st);
 }).map((el) => ({ sel: path(el), style: (el.getAttribute("style") || "").slice(0, 120) })).slice(0, 10);

 return {
  vw: VW, docScroll: document.documentElement.scrollWidth,
  bodyOverflowX: getComputedStyle(document.body).overflowX,
  counts: {
   overflow: overflow.length, small: small.length, crowded, zoomers: zoomers.length,
   keyboards: keyboards.length, unlabelled: unlabelled.length, imgsNoAlt: imgsNoAlt.length,
   inputsNoLabel: inputsNoLabel.length, tiny: tiny.length, pinned: pinned.length,
   heavy: heavy.length, broken: broken.length, vhUsers: vhUsers.length,
   interactive: targets.length, images: document.images.length,
  },
  // Counts above are true totals; the arrays below are bounded samples for diagnosis.
  overflow, small: small.slice(0, 25), zoomers, keyboards, unlabelled, imgsNoAlt, inputsNoLabel,
  tiny: tiny.slice(0, 15), pinned, heavy, broken, vhUsers,
 };
};

type Measured = ReturnType<typeof MEASURE>;
type Row = Measured & { status?: number; finalUrl?: string; gated?: boolean };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0];

/**
 * The app serves two products from one codebase, split by HOST (proxy.ts). Port 3000 is the
 * marketplace (vyaplatform.com); port 3333 is the getvya.ai OS host, where the Store OS lives at
 * the CLEAN path /admin/… rather than /infrastructure/admin/…. Auditing everything on one port
 * silently 404s half the site, so each route carries the surface it belongs to.
 */
const MKT = `http://localhost:${PORT_MKT}`;
const OS = `http://localhost:${PORT_OS}`;

/** Routes with a dynamic segment are resolved by scraping a real link off an index page. */
const DISCOVER: { route: string; base: string; from: string; pattern: RegExp }[] = [
 { route: "/products/:id", base: MKT, from: "/browse", pattern: /^\/products\/[^/]+$/ },
 { route: "/stores/:slug", base: MKT, from: "/stores", pattern: /^\/stores\/[^/]+$/ },
 { route: "/collections/:slug", base: MKT, from: "/collections", pattern: /^\/collections\/[^/]+$/ },
 { route: "/brands/:slug", base: MKT, from: "/brands", pattern: /^\/brands\/[^/]+$/ },
 { route: "/categories/:category", base: MKT, from: "/categories", pattern: /^\/categories\/[^/]+$/ },
 { route: "/s/:handle", base: MKT, from: "/stores", pattern: /^\/s\/[^/]+$/ },
];

const STATIC_ROUTES: { base: string; path: string }[] = [
 // ── marketplace: the shopper's money path ─────────────────────────────────
 ...["/", "/browse", "/search?q=dress", "/new-arrivals", "/stores", "/collections", "/categories",
  "/brands", "/editors-picks", "/checkout", "/you-might-like", "/vintage",
  "/login", "/register", "/waitlist",
  "/for-stores", "/for-stores/analytics", "/stories", "/faqs", "/trust", "/privacy", "/terms",
  "/partner-with-vya", "/consignor", "/sourcing",
  // Needs a real Auth.js session (admin token does not satisfy isSessionOnlyRoute); recorded as
  // redirected-to-login rather than dropped, so the gap is visible in the report.
  "/cart", "/account", "/account/favorites", "/account/settings", "/membership",
  "/store/login", "/store/signup", "/store/dashboard", "/store/orders", "/store/settings",
 ].map((path) => ({ base: MKT, path })),

 // ── getvya.ai OS host: marketing + the Store OS at its clean paths ────────
 ...["/", "/admin", "/admin/inventory", "/admin/orders", "/admin/add-listing", "/admin/settings",
  "/admin/customers", "/admin/discounts", "/admin/storefront", "/admin/onboarding",
  // Market Mode — explicitly a phone-first product, so it is held to the highest bar.
  "/admin/market", "/admin/market/quick", "/admin/market/cart", "/admin/market/inventory",
  "/admin/market/find", "/admin/market/sales", "/admin/market/setup", "/admin/market/bring",
 ].map((path) => ({ base: OS, path })),
];

const run = async () => {
 const browser = await chromium.launch();
 const cookies = await authCookie();
 // isMobile/hasTouch are context-level in Playwright, so the whole run is emulated as a touch
 // device and only the viewport box changes per row.
 const ctx = await browser.newContext({
  deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  viewport: { width: 390, height: 844 },
 });
 if (cookies.length) await ctx.addCookies(cookies);
 const results: Record<string, Record<string, Row | { error: string }>> = {};

 // Resolve dynamic routes first, on a throwaway desktop page.
 const probe = await ctx.newPage();
 await probe.setViewportSize({ width: 1280, height: 900 });
 const resolved: { base: string; path: string }[] = [];
 for (const d of DISCOVER) {
  try {
   await probe.goto(d.base + d.from, { waitUntil: "domcontentloaded", timeout: 45000 });
   await probe.waitForTimeout(2500);
   const href = await probe.evaluate((p: string) => {
    const re = new RegExp(p);
    const a = [...document.querySelectorAll("a[href]")]
     .map((x) => new URL((x as HTMLAnchorElement).href, location.origin).pathname)
     .find((h) => re.test(h));
    return a || null;
   }, d.pattern.source);
   if (href) { resolved.push({ base: d.base, path: href }); console.log(`  resolved ${d.route} -> ${href}`); }
   else console.log(`  !! could not resolve ${d.route} from ${d.from}`);
  } catch (e) { console.log(`  !! ${d.route}: ${msg(e)}`); }
 }
 await probe.close();

 let routes = [...STATIC_ROUTES, ...resolved];
 if (ONLY) routes = ONLY.split(",").map((p) => ({ base: p.startsWith("os:") ? OS : MKT, path: p.replace(/^os:/, "") }));

 for (const r of routes) {
  const key = (r.base === OS ? "os" : "mkt") + " " + r.path;
  results[key] = {};
  for (const vp of VIEWPORTS) {
   const page: Page = await ctx.newPage();
   await page.setViewportSize({ width: vp.width, height: vp.height });
   try {
    const resp = await page.goto(r.base + r.path, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2200);
    const landed = new URL(page.url()).pathname;
    // A page that bounced to sign-in is not the page under audit; measuring it would report the
    // login screen's numbers under the gated route's name.
    const gated = /^\/(login|store\/login|admin\/login)$/.test(landed) && !r.path.includes("login");
    const m = await page.evaluate(MEASURE);
    results[key][vp.name] = { ...m, status: resp?.status(), finalUrl: landed, gated };
    const c = m.counts;
    const flag = c.overflow ? `OVERFLOW×${c.overflow}(${m.overflow[0]?.over}px)` : "";
    console.log(`${key} @${vp.name} ${gated ? "[GATED→login]" : ""} ${flag} small:${c.small} zoom:${c.zoomers} a11y:${c.unlabelled + c.imgsNoAlt + c.inputsNoLabel} pinned:${c.pinned} heavy:${c.heavy} tiny:${c.tiny}`);
   } catch (e) {
    results[key][vp.name] = { error: msg(e) };
    console.log(`${key} @${vp.name}  ERROR ${msg(e)}`);
   }
   await page.close();
  }
 }

 await browser.close();
 fs.mkdirSync(".verify", { recursive: true });
 fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
 console.log(`\nwrote ${JSON_OUT}`);
};

await run();
