/**
 * A FIRST-TIME SHOPPER, walked through a hosted store the way she would actually walk it — and,
 * where it can be done without side effects, compared with the seller's own site side by side.
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/shopper-journey.mts
 *   …--store blummier      one store
 *   …--headed              watch her shop
 *   …--base http://localhost:3000
 *
 * WHY THIS EXISTS. Every other check in this repo reads a page and counts things. None of them ever
 * *shops*. A store can pass parity, pass blackout and pass the account sweep while the cart drawer
 * opens empty, the header's third link 404s, or the Add button on a sold piece cheerfully adds it.
 *
 * WHAT RUNS WHERE, and why it is not symmetric:
 *
 *   compared on BOTH sites — header links, collection contents, "you may also like", videos, the
 *   labelling of sold pieces. All read-only: a GET is all a shopper's browser would do.
 *
 *   exercised on OURS ONLY — adding to the bag, emptying it, reaching checkout, signing in and out.
 *   Doing those against a seller's live shop means real carts, real sign-in emails to whatever
 *   address we typed, and a real checkout session. That is not ours to do to somebody's business.
 *
 * NOTHING IS PURCHASED. The checkout step stops at the checkout page and asserts it loaded.
 * NO EMAIL IS SENT. The sign-in request is fulfilled locally; the session is a cookie minted here,
 * exactly as the verify endpoint mints it, so no row is written either.
 */
import { chromium, type Browser, type Page } from "playwright";
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import { fleetStores } from "../app/lib/fleet-roster.ts";
import { signShopperToken, SHOPPER_COOKIE } from "../app/lib/shopper-session.ts";

const arg = (n: string): string | null => {
 const i = process.argv.indexOf(`--${n}`);
 return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
};
const BASE = (arg("base") || "http://localhost:3000").replace(/\/+$/, "");
const PORT = new URL(BASE).port || "80";
const SUFFIX = (process.env.STORE_HOST_SUFFIX || "vyasites.test").replace(/^\./, "");
const ONLY = arg("store");
const HEADED = process.argv.includes("--headed");
const SHOPPER = "vya-journey@example.com";

type Verdict = "pass" | "fail" | "skip";
type Step =
 | "home" | "header" | "video" | "collection" | "product" | "recommend"
 | "add" | "drawer" | "remove" | "checkout" | "soldout" | "signin" | "signout";
const STEPS: Step[] = ["home", "header", "video", "collection", "product", "recommend", "add", "drawer", "remove", "checkout", "soldout", "signin", "signout"];
type Result = { store: string; status: Partial<Record<Step, Verdict>>; notes: string[] };

const ours = (slug: string, path = "/") => `http://${slug}.${SUFFIX}${PORT === "80" ? "" : `:${PORT}`}${path}`;

/** Wait for a condition rather than sleeping and reading once. */
async function until<T>(get: () => Promise<T>, ok: (v: T) => boolean, ms = 9000): Promise<T> {
 const deadline = Date.now() + ms;
 let last = await get().catch(() => null as T);
 while (Date.now() < deadline) {
  if (ok(last)) return last;
  await new Promise((r) => setTimeout(r, 250));
  last = await get().catch(() => last);
 }
 return last;
}

/** What the SERVER says is in the bag — never the page's own idea of it. */
const serverCart = (p: Page) => p.evaluate(async () => {
 const r = await fetch("/cart.js", { headers: { Accept: "application/json" } });
 const j = await r.json().catch(() => ({}));
 return { count: (j as { item_count?: number }).item_count ?? 0 };
});

const settle = async (p: Page, ms = 2500) => {
 await p.waitForLoadState("load", { timeout: 25000 }).catch(() => {});
 await p.waitForTimeout(ms);
};

/** The header, as a shopper reads it: the visible words she can click. */
const headerLinks = (p: Page) => p.evaluate(() => {
 // Dropdown items are counted too: hidden behind a hover on BOTH sites is not the same as absent
 // from ours, and only one of those is a fault.
 const seen = new Set<string>(); const out: { text: string; href: string; hidden: boolean }[] = [];
 for (const a of document.querySelectorAll("header a[href], nav a[href], [class*='header' i] a[href]")) {
  const r = a.getBoundingClientRect();
  // NO PIXEL CUTOFF. The first version ignored anything below 400px, and ascensio-demo's header is
  // 42px taller on our copy than on hers — so her "Christian Dior" at top 368 counted, ours at 410
  // did not, and a link visible on both sites was reported missing from ours. Being inside the
  // header element is the question; where the header happens to end is not.
  const hidden = r.width < 8 || r.height < 8;
  const text = (a.textContent || "").replace(/\s+/g, " ").trim();
  const href = a.getAttribute("href") || "";
  if (!text || text.length > 40 || seen.has(text.toLowerCase())) continue;
  seen.add(text.toLowerCase());
  out.push({ text, href, hidden });
 }
 return out;
});

const productHandles = (p: Page) => p.evaluate(() => [...new Set(
 [...document.querySelectorAll('a[href*="/products/"]')]
  .map((a) => (a.getAttribute("href") || "").match(/\/products\/([^/?#]+)/)?.[1] || "")
  .filter(Boolean))]);

const playingVideos = (p: Page) => p.evaluate(() =>
 [...document.querySelectorAll("video")].filter((v) => v.readyState > 2 || !v.paused).length);


/**
 * The control a shopper could ACTUALLY press.
 *
 * `:visible` in Playwright means "has a non-empty box" — not "in the viewport, not covered, and
 * receiving clicks". A page carries the same control several times: a sticky-bar copy, a mobile
 * duplicate, a template. lamash has two Add buttons and the first is off-screen and covered, so
 * clicking `.first()` timed out and reported a working store as broken.
 *
 * This is written down in scripts/verify-carts.mts, from the last time it cost a whole run. I wrote
 * this harness anyway and walked straight into it.
 */
async function pressable(page: Page, selector: string) {
 const all = page.locator(selector);
 const n = await all.count().catch(() => 0);
 for (let i = 0; i < Math.min(n, 8); i++) {
  const el = all.nth(i);
  // SCROLL FIRST. elementFromPoint only answers about the visible viewport, so a control below the
  // fold used to be hit-tested at the clamped edge of the screen, hit whatever happened to be there
  // and get rejected as unreachable — after which this fell back to .first(), a hidden 0x0 twin of
  // the real button, and the click timed out. loved-again's Add to cart sits 45px below the fold;
  // that alone was reported as "pressing Add did not change the bag" on a store where it works.
  await el.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const ok = await el.evaluate((e) => {
   const r = e.getBoundingClientRect();
   if (r.width < 8 || r.height < 8) return false;
   const cs = getComputedStyle(e);
   if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") return false;
   // Still off-screen after scrolling (a sticky bar, a transformed parent): unreachable, not "hit
   // whatever is at the edge of the screen instead".
   const cx = r.left + r.width / 2;
   const cy = r.top + r.height / 2;
   if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
   const hit = document.elementFromPoint(cx, cy);
   return !!hit && (hit === e || e.contains(hit) || hit.contains(e));
  }).catch(() => false);
  if (ok) return el;
 }
 return all.first(); // nothing pressable — let the click fail and be reported honestly
}

async function walk(browser: Browser, slug: string, sourceOrigin: string | null, buyable: string | null): Promise<Result> {
 const r: Result = { store: slug, status: {}, notes: [] };
 const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
 const p = await ctx.newPage();
 const note = (s: string) => { if (r.notes.length < 6) r.notes.push(s); };

 try {
  // ── she arrives ────────────────────────────────────────────────────────────────────────────
  await p.goto(ours(slug), { waitUntil: "domcontentloaded", timeout: 40000 });
  await settle(p, 3500);
  const home = await p.evaluate(() => ({ text: (document.body.innerText || "").trim().length, imgs: [...document.images].filter((i) => i.naturalWidth > 0).length }));
  r.status.home = home.text > 300 && home.imgs > 0 ? "pass" : "fail";
  if (r.status.home === "fail") note(`the homepage rendered ${home.text} characters and ${home.imgs} images`);

  // ── the header, hers and ours ──────────────────────────────────────────────────────────────
  const mine = await headerLinks(p);
  let hers: { text: string; href: string; hidden: boolean }[] = [];
  if (sourceOrigin) {
   const q = await ctx.newPage();
   await q.goto(sourceOrigin, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
   await settle(q, 3000);
   hers = await headerLinks(q).catch(() => []);
   await q.close();
  }
  // Every word she can click on the seller's own header should be clickable on ours.
  // Her account and cart links are bound to OUR panel and drawer, which strips their href — so they
  // are not "missing", they are ours now. Flagging them buries the links that genuinely are gone.
  const REBOUND = /log ?in|sign ?in|account|cart|bag|basket|checkout/i;
  const missing = hers.filter((h) => !REBOUND.test(h.text) && !mine.some((m) => m.text.toLowerCase() === h.text.toLowerCase()));
  // And every link of OURS must actually go somewhere — a header link to a 404 is the first thing a
  // shopper hits and the last thing any content check looks at.
  const broken: string[] = [];
  for (const link of mine.slice(0, 12)) {
   const href = link.href;
   if (link.hidden) continue; // a dropdown item is not something she can click without opening it
   if (!href || href.startsWith("#") || /^(mailto|tel|javascript)/i.test(href)) continue;
   const url = href.startsWith("http") ? href : ours(slug, href.startsWith("/") ? href : `/${href}`);
   if (!url.includes(`${slug}.${SUFFIX}`)) continue; // her Instagram is not ours to answer for
   const res = await p.request.get(url, { timeout: 20000 }).catch(() => null);
   if (!res || res.status() >= 400) broken.push(`${link.text} → ${res ? res.status() : "no answer"}`);
  }
  r.status.header = broken.length ? "fail" : "pass";
  if (broken.length) note(`header link(s) that do not load: ${broken.slice(0, 3).join(", ")}`);
  else if (missing.length) note(`${missing.length} header link(s) on her site are not on ours: ${missing.slice(0, 3).map((m) => m.text).join(", ")}`);

  // ── the video she sees first ───────────────────────────────────────────────────────────────
  const vid = await playingVideos(p);
  r.status.video = vid > 0 ? "pass" : "skip";
  if (!vid) note("no video on the homepage — nothing to compare");

  // ── a collection, hers and ours ────────────────────────────────────────────────────────────
  const colHref = await p.evaluate(() => {
   const a = [...document.querySelectorAll('a[href*="/collections/"]')]
    .map((x) => x.getAttribute("href") || "")
    .find((h) => /\/collections\/[^/?#]+$/.test(h) && !/\/collections\/all$/.test(h));
   return a || null;
  });
  if (!colHref) { r.status.collection = "skip"; note("no collection linked from the homepage"); }
  else {
   const path = colHref.startsWith("http") ? new URL(colHref).pathname : colHref;
   await p.goto(ours(slug, path), { waitUntil: "domcontentloaded", timeout: 40000 });
   await settle(p, 3000);
   const mineH = await productHandles(p);
   let hersH: string[] = [];
   if (sourceOrigin) {
    const q = await ctx.newPage();
    await q.goto(sourceOrigin.replace(/\/$/, "") + path, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
    await settle(q, 3000);
    hersH = await productHandles(q).catch(() => []);
    await q.close();
   }
   const absent = hersH.filter((h) => !mineH.includes(h));
   r.status.collection = mineH.length > 0 && absent.length <= Math.max(2, hersH.length * 0.15) ? "pass" : "fail";
   note(`${path}: ${mineH.length} pieces here, ${hersH.length} on hers${absent.length ? `, ${absent.length} of hers absent` : ""}`);
  }
 
  // ── she opens a piece ──────────────────────────────────────────────────────────────────────
  // A piece she could actually buy. Taking the first handle on the page picked a SOLD Valentino on
  // the first run, reported "0 add buttons" as a fault, and then passed `remove` and `checkout`
  // trivially because the bag had never been filled. A shopper testing a bag needs something buyable.
  const handles = await p.evaluate(() => {
   const out: { handle: string; sold: boolean }[] = [];
   const seen = new Set<string>();
   for (const a of document.querySelectorAll('a[href*="/products/"]')) {
    const h = (a.getAttribute("href") || "").match(/\/products\/([^/?#]+)/)?.[1];
    if (!h || seen.has(h)) continue;
    seen.add(h);
    const card = a.closest("li, article, [class*='card' i], [class*='product' i]");
    out.push({ handle: h, sold: /sold\s*out|sold$/i.test((card?.textContent || "").trim()) });
   }
   return out;
  });
  // What SHE would click first — used to judge the product page.
  const handle = (handles.find((h) => !h.sold) ?? handles[0])?.handle || null;
  // What the BAG is tested with. Reading "sold" off a card is unreliable — on the first run it read
  // a sold Valentino as buyable, found no Add button (correct, it is sold) and called three legs
  // broken. A piece the database says is active removes the guesswork from the part that must be
  // exact; the browsing above is still done the way a shopper browses.
  const cartHandle = buyable || handle;
  if (!handle) { for (const k of ["product", "recommend", "add", "drawer", "remove", "checkout", "soldout"] as Step[]) r.status[k] = "skip"; note("no product reachable to shop with"); }
  else {
   await p.goto(ours(slug, `/products/${handle}`), { waitUntil: "domcontentloaded", timeout: 40000 });
   await settle(p, 3000);
   const pd = await p.evaluate(() => ({
    // NOT the first h1 on the page. bag-crush's first h1 is the site LOGO
    // (`h1.site-header__heading`, empty because the logo is an image), so the harness read the
    // product page as having no title and failed a page that was perfectly fine. The product's own
    // heading is the one outside the site header.
    title: (() => {
     const hs = [...document.querySelectorAll("h1, h2")].filter((h) => !h.closest("header, [class*='site-header' i], [class*='header' i]"));
     const first = hs.map((h) => (h.textContent || "").trim()).find(Boolean);
     return (first || document.title.split(/[–|-]/)[0] || "").trim().slice(0, 60);
    })(),
    money: /[$£€]\s?\d/.test(document.body.innerText || ""),
    add: document.querySelectorAll("[data-vya-add], button[name='add'], form[action*='/cart/add'] button").length,
   }));
   // A SOLD piece with no Add button is correct, not broken — that is the whole point of marking it
   // sold. What must never happen is a sold piece that still offers to sell.
   const soldHere = await p.evaluate(() => /sold\s*out/i.test(document.body.innerText || ""));
   r.status.product = Boolean(pd.title) && pd.money && (pd.add > 0 || soldHere) ? "pass" : "fail";
   if (r.status.product === "fail") note(`product page: title "${pd.title}", price ${pd.money}, ${pd.add} add button(s), sold ${soldHere}`);

   // "You may also like" — she scrolls to the bottom and expects to be shown something else.
   await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } });
   await p.waitForTimeout(2500);
   const rec = await p.evaluate(() => {
    const els = [...document.querySelectorAll('[class*="recommend" i],[id*="recommend" i],[class*="related" i],[class*="also-like" i]')];
    const withCards = els.filter((e) => e.querySelectorAll('a[href*="/products/"]').length > 0);
    return { blocks: els.length, cards: withCards.reduce((n, e) => n + e.querySelectorAll('a[href*="/products/"]').length, 0) };
   });
   // An empty block is only a FAILURE if she shows a filled one. bag-crush carries an empty Shopify
   // section wrapper, nought pixels tall, on her OWN site too — reporting that as broken sent me
   // chasing a recommendations endpoint that was working perfectly the whole time. So when ours is
   // empty, go and look at hers before saying anything.
   if (rec.cards > 0) r.status.recommend = "pass";
   else if (!rec.blocks) r.status.recommend = "skip";
   else {
    const hersHasCards = sourceOrigin
     ? await (async () => {
        const q = await ctx.newPage();
        try {
         await q.goto(`${sourceOrigin}/products/${handle}`, { waitUntil: "domcontentloaded", timeout: 40000 });
         await q.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } });
         await q.waitForTimeout(2500);
         return await q.evaluate(() => [...document.querySelectorAll('[class*="recommend" i],[id*="recommend" i],[class*="related" i],[class*="also-like" i]')]
          .some((e) => e.querySelectorAll('a[href*="/products/"]').length > 0));
        } catch { return null; } finally { await q.close().catch(() => {}); }
       })()
     : null;
    r.status.recommend = hersHasCards === true ? "fail" : "skip";
    if (hersHasCards === true) note(`her site shows "you may also like" pieces here and ours shows none`);
    else if (hersHasCards === false) note(`neither site shows "you may also like" pieces here — matching her`);
    else note(`"you may also like" is empty here; could not check hers`);
   }

   // ── she puts it in the bag ─────────────────────────────────────────────────────────────────
   if (cartHandle && cartHandle !== handle) {
    await p.goto(ours(slug, `/products/${cartHandle}`), { waitUntil: "domcontentloaded", timeout: 40000 });
    await settle(p, 2500);
   }
   const before = (await serverCart(p)).count;
   await (await pressable(p, "[data-vya-add], button[name='add'], form[action*='/cart/add'] button"))
    .click({ timeout: 9000 }).catch(() => {});
   const after = await until(() => serverCart(p), (c) => c.count > before, 12000);
   r.status.add = after.count > before ? "pass" : "fail";
   if (r.status.add === "fail") note("pressing Add did not change the bag");

   // ── the drawer opens, and it is not empty ──────────────────────────────────────────────────
   await (await pressable(p, "[data-vya-cart-open], #vya-cart-btn")).click({ timeout: 9000 }).catch(() => {});
   await p.waitForTimeout(1200);
   const drawer = await p.evaluate(() => {
    const el = document.querySelector("#vya-cart-drawer");
    if (!el) return { open: false, lines: 0 };
    const r = el.getBoundingClientRect();
    const open = r.width > 60 && r.right > 0 && r.left < innerWidth;
    return { open, lines: el.querySelectorAll('[data-vya-remove], [class*="line" i], li').length };
   });
   r.status.drawer = drawer.open && drawer.lines > 0 ? "pass" : "fail";
   if (r.status.drawer === "fail") note(`the bag drawer ${drawer.open ? "opened empty" : "did not open"}`);

   // ── she changes her mind ───────────────────────────────────────────────────────────────────
   await (await pressable(p, "[data-vya-remove], [data-vya-cart-remove], [aria-label*='remove' i]"))
    .click({ timeout: 9000 }).catch(() => {});
   // Only meaningful if something got in. "The bag is empty" is not evidence that Remove works when
   // the bag was empty to begin with — that is a green tick for doing nothing.
   if (r.status.add !== "pass") { r.status.remove = "skip"; note("nothing was in the bag to remove"); }
   else {
    const emptied = await until(() => serverCart(p), (c) => c.count === 0, 12000);
    r.status.remove = emptied.count === 0 ? "pass" : "fail";
    if (r.status.remove === "fail") note(`removing left ${emptied.count} in the bag`);
   }

   // ── and then decides to buy after all ──────────────────────────────────────────────────────
   // NOTHING IS PURCHASED. We put one piece back, reach the checkout page, and confirm it loaded.
   await p.goto(ours(slug, `/products/${cartHandle}`), { waitUntil: "domcontentloaded", timeout: 40000 });
   await settle(p, 2000);
   await (await pressable(p, "[data-vya-add], button[name='add']")).click({ timeout: 9000 }).catch(() => {});
   await until(() => serverCart(p), (c) => c.count > 0, 12000);
   const inBag = (await serverCart(p)).count;
   if (!inBag) { r.status.checkout = "skip"; note("could not fill the bag, so checkout was not reached"); }
   else {
    const co = await p.evaluate(async () => {
     const r = await fetch("/checkout?cart=1", { redirect: "follow" });
     const body = await r.text();
     return { status: r.status, chars: body.trim().length };
    }).catch(() => ({ status: 0, chars: 0 }));
    // A 200 that returns nothing is not a checkout page. NOTHING IS PURCHASED — we stop here.
    r.status.checkout = co.status > 0 && co.status < 400 && co.chars > 500 ? "pass" : "fail";
    if (r.status.checkout === "fail") note(`checkout answered ${co.status} with ${co.chars} characters`);
   }
   // Tidy up after ourselves — leave no bag behind.
   await (await pressable(p, "[data-vya-remove], [data-vya-cart-remove]")).click({ timeout: 6000 }).catch(() => {});

   // ── a piece that has already sold ──────────────────────────────────────────────────────────
   const sold = await p.evaluate(() => {
    const el = [...document.querySelectorAll('a[href*="/products/"]')].find((a) => /sold/i.test((a.closest("li, article, div")?.textContent || "")));
    return el ? (el.getAttribute("href") || "").match(/\/products\/([^/?#]+)/)?.[1] || null : null;
   }).catch(() => null);
   if (!sold) { r.status.soldout = "skip"; note("no sold piece on this page to try"); }
   else {
    await p.goto(ours(slug, `/products/${sold}`), { waitUntil: "domcontentloaded", timeout: 40000 });
    await settle(p, 2500);
    const wasCount = (await serverCart(p)).count;
    const state = await p.evaluate(() => {
     const b = [...document.querySelectorAll("button, [data-vya-add]")].find((e) => /add|sold/i.test(e.textContent || ""));
     return { label: (b?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30), disabled: b ? (b as HTMLButtonElement).disabled : null };
    });
    await (await pressable(p, "[data-vya-add], button[name='add']")).click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const nowCount = (await serverCart(p)).count;
    // The only thing that matters: a sold piece must not end up in a shopper's bag.
    r.status.soldout = nowCount === wasCount ? "pass" : "fail";
    note(`sold piece says "${state.label || "(no button)"}"${nowCount > wasCount ? " and WENT IN THE BAG" : ""}`);
   }
  }

  // ── she signs in ───────────────────────────────────────────────────────────────────────────
  // The request is fulfilled here: no email is sent to anyone by a test run.
  await p.route("**/api/storefront/account/signin", (route) =>
   route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sent: true }) }));
  await p.goto(ours(slug), { waitUntil: "domcontentloaded", timeout: 40000 });
  await settle(p, 2500);
  await (await pressable(p, "[data-vya-account-open]")).click({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(700);
  const box = p.locator("#vya-account-email");
  if (await box.count()) {
   await box.fill(SHOPPER);
   await p.locator("[data-vya-signin]").first().click().catch(() => {});
   const said = await until(() => p.locator("#vya-account-msg").textContent().then((t) => t || ""), (t) => /check your email|didn't send/i.test(t));
   r.status.signin = /check your email/i.test(said) ? "pass" : "fail";
   if (r.status.signin === "fail") note(`after asking for a link the panel said "${said.slice(0, 40)}"`);
  } else { r.status.signin = "fail"; note("no email box in the account panel"); }

  // ── and out again ──────────────────────────────────────────────────────────────────────────
  // The session is minted here, exactly as the verify endpoint mints it, so no row is written.
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) { r.status.signout = "skip"; note("AUTH_SECRET not set — signed-in legs skipped"); }
  else {
   await ctx.addCookies([{ name: SHOPPER_COOKIE, value: signShopperToken({ email: SHOPPER, storeSlug: slug }, secret),
    domain: `${slug}.${SUFFIX}`, path: "/", httpOnly: true, sameSite: "Lax" }]);
   await p.goto(ours(slug), { waitUntil: "domcontentloaded", timeout: 40000 });
   await settle(p, 2500);
   await (await pressable(p, "[data-vya-account-open]")).click({ timeout: 8000 }).catch(() => {});
   await p.waitForTimeout(700);
   const signedIn = ((await p.locator("#vya-account-panel").textContent().catch(() => "")) || "").includes(SHOPPER);
   // OPEN THE PANEL FIRST, the way a shopper does. Sign out lives inside the account panel, which is
   // a slide-out on most themes: closed, its button sits off the right edge of the screen (measured
   // at left=1522 in a 1440px viewport on shop-vintage-charm). Clicking it there does nothing, and
   // this leg then reported "signing out left the session alive" on a store where it works fine.
   await (await pressable(p, "[data-vya-account], #vya-account-btn, [data-vya-account-open]"))
    .click({ timeout: 8000 }).catch(() => {});
   await p.waitForTimeout(1200);
   await (await pressable(p, "[data-vya-signout]")).click({ timeout: 8000 }).catch(() => {});
  // Same reload as above — ask after it, not during it.
  await p.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(800);
   const out = await until(() => p.evaluate(async () => {
    const res = await fetch("/api/storefront/account/orders", { headers: { Accept: "application/json" } });
    return res.json().catch(() => null);
   }), (v) => Boolean(v) && (v as { signedIn?: boolean }).signedIn === false);
   r.status.signout = signedIn && out && (out as { signedIn?: boolean }).signedIn === false ? "pass" : "fail";
   if (r.status.signout === "fail") note(signedIn ? "signing out left the session alive" : "a valid session did not show as signed in");
  }
 } catch (e) {
  note(`walked into a wall: ${String((e as Error).message).slice(0, 70)}`);
 }
 await ctx.close();
 return r;
}

async function main() {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) { console.error("DATABASE_URL is not set — run with --env-file=.env.local"); process.exit(1); }
 const sql = neon(dbUrl);
 const rows = (await sql`
  SELECT c.store_slug, MIN(c.source_url) AS source_url
  FROM site_captures c JOIN sellers s ON s.slug = c.store_slug
  WHERE c.path = '/' GROUP BY c.store_slug ORDER BY c.store_slug`) as { store_slug: string; source_url: string }[];
 const roster = new Set(fleetStores(rows.map((r) => r.store_slug)));
 const stores = rows.filter((r) => roster.has(r.store_slug) && (!ONLY || r.store_slug === ONLY));
 if (!stores.length) { console.error(ONLY ? `No store called "${ONLY}".` : "No stores."); process.exit(1); }

 console.log(`\nShopping ${stores.length} store(s) against ${BASE}`);
 console.log(`Bag, checkout and sign-in run on OUR copy only — no seller's shop is touched beyond a page load.`);
 console.log(`Nothing is purchased and no email is sent.\n`);

 const browser = await chromium.launch({
  channel: "chrome", headless: !HEADED,
  args: [`--host-resolver-rules=MAP *.${SUFFIX} 127.0.0.1`, "--run-all-compositor-stages-before-draw"],
 });
 const results: Result[] = [];
 const LOG = ".verify/shopper-journey.txt";
 fs.mkdirSync(".verify", { recursive: true });
 fs.writeFileSync(LOG, `shopping ${stores.length} stores\n`);

 for (const s of stores) {
  const origin = (() => { try { return new URL(s.source_url).origin; } catch { return null; } })();
  // One piece the database says is active, so the bag legs are not at the mercy of what happens to
  // sit first on a collection page.
  const [act] = (await sql`SELECT i.source_id FROM items i JOIN sellers se ON se.id = i.seller_id
   WHERE se.slug = ${s.store_slug} AND i.status = ${"active"} AND i.source_id IS NOT NULL LIMIT 1`) as { source_id: string }[];
  // A hard cap per store: one page that never settles must cost this run four minutes, not all of it.
  const out = await Promise.race([
   walk(browser, s.store_slug, origin, act?.source_id ?? null),
   new Promise<Result>((res) => setTimeout(() => res({ store: s.store_slug, status: {}, notes: ["timed out"] }), 240000)),
  ]);
  results.push(out);
  const line = `  ${out.store.padEnd(26)}${STEPS.map((k) => (out.status[k] ?? "  - ").toUpperCase().padEnd(6)).join("")}`;
  console.log(line);
  for (const n of out.notes) console.log(`      · ${n}`);
  fs.appendFileSync(LOG, `${line}\n${out.notes.map((n) => `      · ${n}`).join("\n")}\n`);
 }
 await browser.close();

 console.log(`\n${"STORE".padEnd(26)}${STEPS.map((k) => k.toUpperCase().slice(0, 5).padEnd(6)).join("")}`);
 const failed = results.filter((r) => Object.values(r.status).includes("fail") || !Object.keys(r.status).length);
 console.log(`\n${results.length - failed.length}/${results.length} stores a shopper could get through.`);
 for (const f of failed) {
  const bad = STEPS.filter((k) => f.status[k] === "fail");
  console.log(`  ${f.store}: ${bad.join(", ") || "never started"}`);
 }
 fs.writeFileSync(".verify/shopper-journey.json", JSON.stringify(results, null, 1));
 process.exit(failed.length ? 1 : 0);
}

main();
