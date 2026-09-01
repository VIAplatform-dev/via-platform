/**
 * Does a shopper's account actually work — the seller's own person icon, the sign-in, the orders?
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/verify-account.mts
 *   …--store test-import     one store
 *   …--headed                watch it happen
 *   …--base http://localhost:3348
 *
 * WHY THIS EXISTS. Three of the four pieces are HTML we inject into somebody else's theme, and the
 * fourth is a cookie. Every one of those can be perfectly correct on the server and dead in the
 * browser: an icon the theme's own JavaScript re-binds, a panel a theme's stacking context buries,
 * a cookie a host mismatch throws away. Only a real browser clicking the seller's own icon can say.
 *
 * THREE THINGS ARE CHECKED, in the order a shopper meets them:
 *   icon    the seller's person icon opens OUR panel (and only one panel exists)
 *   signin  the email box asks the server for a link and says so — the request is STUBBED here, so
 *           no email is ever sent to anybody by a test run
 *   account a real signed-in session shows who she is, lists her orders, and signs out again
 *
 * READ-ONLY BY DEFAULT. The signed-in legs use a session cookie minted here, exactly as the verify
 * endpoint mints it — so a full run browses and writes nothing. Pass --follow-link to walk the real
 * email link instead, which records the shopper against the store; that is a database write, so it
 * runs on one blessed store only (--signin-store, default test-import).
 */
import { chromium, type Browser, type Page } from "playwright";
import { neon } from "@neondatabase/serverless";
import { signInLinkToken } from "../app/lib/shopper-signin.ts";
import { signShopperToken, SHOPPER_COOKIE } from "../app/lib/shopper-session.ts";
import { fleetStores } from "../app/lib/fleet-roster.ts";

const arg = (name: string): string | null => {
 const i = process.argv.indexOf(`--${name}`);
 return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
};
const BASE = (arg("base") || "http://localhost:3348").replace(/\/+$/, "");
const PORT = new URL(BASE).port || "80";
const SUFFIX = (process.env.STORE_HOST_SUFFIX || "vyasites.test").replace(/^\./, "");
const ONLY = arg("store");
const WRITE_STORE = arg("signin-store") || "test-import";
const HEADED = process.argv.includes("--headed");
// Off by default: following the link for real records the shopper against the store.
const FOLLOW_LINK = process.argv.includes("--follow-link");
const SHOPPER = "vya-harness@example.com";

type Step = "bag" | "icon" | "panel" | "signin" | "session" | "orders" | "signout" | "isolation";
const STEPS: Step[] = ["bag", "icon", "panel", "signin", "session", "orders", "signout", "isolation"];
type Result = { store: string; status: Partial<Record<Step, "pass" | "fail" | "skip">>; notes: string[] };

// A run that hangs must say WHERE. The first version reported only "timed out", which is the least
// useful sentence a harness can produce.
const TRACE = process.argv.includes("--trace");
let at = "start";
const step = (s: string) => { at = s; if (TRACE) console.error(`    · ${s}`); };

/**
 * Wait for a condition instead of sleeping and reading once.
 *
 * The first version of this harness read the panel's message the instant it clicked and reported a
 * working sign-in as broken because the text still said "Sending…". Every check here is racing a
 * fetch; none of them may be a single read.
 */
async function until<T>(get: () => Promise<T>, ok: (v: T) => boolean, ms = 10000): Promise<T> {
 const deadline = Date.now() + ms;
 let last = await get().catch(() => null as T);
 while (Date.now() < deadline) {
  if (ok(last)) return last;
  await new Promise((r) => setTimeout(r, 300));
  last = await get().catch(() => last);
 }
 return last;
}

/**
 * The account control a SHOPPER can actually reach.
 *
 * Themes carry the icon two and three times over — a hidden mobile menu-drawer copy, a desktop
 * header copy, a footer link — and clicking `.first()` found a 0x0 invisible one and reported eight
 * perfectly working stores as broken. The same trap the cart harness documents, walked into again.
 */
const openControl = (page: Page) => page.locator('[data-vya-account-open]:visible').first();

const url = (slug: string, path = "/") => `http://${slug}.${SUFFIX}${PORT === "80" ? "" : `:${PORT}`}${path}`;

async function runStore(browser: Browser, slug: string, mayWrite: boolean): Promise<Result> {
 const r: Result = { store: slug, status: {}, notes: [] };
 const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
 const page = await ctx.newPage();

 try {
  step("load home");
  // WAIT FOR THE PAGE TO SETTLE, not just to parse. A theme finishes its header on hydration, and
  // measuring at domcontentloaded reported a working store as broken the one time the dev server
  // was compiling cold. Whether a shopper can reach a control is a question about the finished page.
  await page.goto(url(slug), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(900);

  // ── icon ───────────────────────────────────────────────────────────────────────────────────
  // Bound server-side, so what we look for is our attribute ON the seller's own control — not a
  // control of ours added beside hers.
  // ── bag ────────────────────────────────────────────────────────────────────────────────────
  // ONE cart icon, not two. The theme's own control is bound to our drawer, and our floating pill
  // exists only for the stores whose themes have no cart control at all. Both were on screen at
  // once until this week, which is exactly the kind of thing HTML looks fine for.
  step("bag");
  // REACHABLE controls, not bound ones. A control we bound server-side can end up 0x0 after the
  // theme rebuilds its header — shop-vintage-charm's is exactly that — and the page then correctly
  // shows our pill instead, because otherwise a shopper has NO way to the bag. Counting bound
  // controls reported that as "two bags on screen" when there was one: the check punished the fix.
  const themeCart = await page.evaluate(() => [...document.querySelectorAll("[data-vya-cart-open]")].filter((e) => {
   const q = e.getBoundingClientRect();
   if (q.width < 4 || q.height < 4) return false;
   if (q.bottom < 0 || q.right < 0 || q.top > innerHeight || q.left > innerWidth) return false;
   const cs = getComputedStyle(e);
   if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) <= 0.05) return false;
   const x = Math.min(Math.max(q.left + q.width / 2, 1), innerWidth - 1);
   const y = Math.min(Math.max(q.top + q.height / 2, 1), innerHeight - 1);
   const hit = document.elementFromPoint(x, y);
   return !!hit && (hit === e || e.contains(hit) || hit.contains(e));
  }).length).catch(() => 0);
  const pillVisible = await page.locator("#vya-cart-btn").isVisible().catch(() => false);
  if (themeCart > 0) {
   r.status.bag = pillVisible ? "fail" : "pass";
   if (pillVisible) r.notes.push("two bags on screen: the theme's control AND our pill");
  } else {
   // No control of her own — the pill is the only way to reach the bag, so it MUST be there.
   r.status.bag = pillVisible ? "pass" : "fail";
   if (!pillVisible) r.notes.push("no cart control in the theme and no pill either — the bag is unreachable");
  }

  step("find icon");
  const bound = await page.locator('[data-vya-account-open]').count();
  // Every store gets a sign-in now, including the six whose themes never had an account control.
  // What matters is that SOMETHING a shopper can see opens it — hers where she has one, ours where
  // she does not. A store where neither is reachable has no sign-in at all, and that is the failure.
  const reachable = await page.locator('[data-vya-account-open]:visible').count();
  const ours = await page.locator("#vya-account-fallback").count();
  r.status.icon = reachable > 0 ? "pass" : "fail";
  if (!reachable) r.notes.push(`${bound} account control(s) in the page, none a shopper can reach`);
  else if (ours) r.notes.push(bound > 1 ? "her own account link is unreachable — opened by ours" : "no account control in this theme — opened by ours");

  // ── panel ──────────────────────────────────────────────────────────────────────────────────
  // Exactly one, and it must actually become visible: a panel behind the theme's own header, or
  // one the theme's click handler swallows, is the failure this leg exists to catch.
  step("open panel");
  const panels = await page.locator("#vya-account-panel").count();
  if (panels !== 1) {
   r.status.panel = "fail";
   r.notes.push(panels === 0 ? "no panel in the page" : `${panels} panels stacked`);
  } else {
   await openControl(page).click({ timeout: 8000 }).catch(() => {});
   const visible = await page.locator("#vya-account-panel.open").isVisible().catch(() => false);
   r.status.panel = visible ? "pass" : "fail";
   if (!visible) r.notes.push("the icon did not open the panel");
  }

  // ── signin ─────────────────────────────────────────────────────────────────────────────────
  // The request is fulfilled here rather than by the server: this leg is about whether the box,
  // the button and the message are wired to each other. No email leaves the machine.
  step("signin box");
  await page.route("**/api/storefront/account/signin", (route) =>
   route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sent: true }) }));
  const box = page.locator("#vya-account-email");
  if (await box.count()) {
   await box.fill(SHOPPER);
   await page.locator("[data-vya-signin]").first().click().catch(() => {});
   const said = await until(
    () => page.locator("#vya-account-msg").textContent().then((t) => t || ""),
    (t) => /check your email|didn't send/i.test(t),
   );
   r.status.signin = /check your email/i.test(said || "") ? "pass" : "fail";
   if (r.status.signin === "fail") r.notes.push(`after submitting, the panel said "${(said || "").slice(0, 40)}"`);
  } else {
   r.status.signin = "fail";
   r.notes.push("no email box in a signed-out panel");
  }

  if (!mayWrite) {
   for (const s of ["session", "orders", "signout", "isolation"] as Step[]) r.status[s] = "skip";
   await ctx.close();
   return r;
  }

  // ── session ────────────────────────────────────────────────────────────────────────────────
  // A real link, minted the way the email mints it, followed the way a shopper follows it.
  step("session");
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) { r.notes.push("AUTH_SECRET not set — signed-in legs skipped"); for (const s of ["session", "orders", "signout", "isolation"] as Step[]) r.status[s] = "skip"; await ctx.close(); return r; }
  if (FOLLOW_LINK) {
   const token = signInLinkToken({ email: SHOPPER, storeSlug: slug }, secret);
   await page.goto(url(slug, `/api/storefront/account/verify?token=${encodeURIComponent(token)}`), { waitUntil: "domcontentloaded", timeout: 25000 });
  } else {
   // The same cookie the verify endpoint would set, minted here so a run writes nothing. What is
   // being tested from here on is whether the SERVED PAGE reads a session — not who set it.
   await ctx.addCookies([{
    name: SHOPPER_COOKIE,
    value: signShopperToken({ email: SHOPPER, storeSlug: slug }, secret),
    domain: `${slug}.${SUFFIX}`, path: "/", httpOnly: true, sameSite: "Lax",
   }]);
   await page.goto(url(slug), { waitUntil: "domcontentloaded", timeout: 25000 });
  }
  await page.waitForTimeout(600);
  await openControl(page).click({ timeout: 8000 }).catch(() => {});
  const who = await page.locator("#vya-account-panel").textContent().catch(() => "");
  r.status.session = (who || "").includes(SHOPPER) ? "pass" : "fail";
  if (r.status.session === "fail") r.notes.push("followed a valid link and the panel still asks me to sign in");

  // ── orders ─────────────────────────────────────────────────────────────────────────────────
  // The endpoint must know her, and must never hand back the seller's economics. An empty list is
  // a pass: a harness shopper has bought nothing, and "no orders yet" is the right answer.
  step("orders");
  const got = await page.evaluate(async () => {
   const res = await fetch("/api/storefront/account/orders", { headers: { Accept: "application/json" } });
   return { status: res.status, body: await res.text() };
  }).catch(() => ({ status: 0, body: "" }));
  const parsed = (() => { try { return JSON.parse(got.body); } catch { return null; } })();
  const leaked = /"(feeCents|costCents|buyerEmail)"/.test(got.body);
  r.status.orders = parsed?.signedIn === true && Array.isArray(parsed.orders) && !leaked ? "pass" : "fail";
  if (leaked) r.notes.push("the orders endpoint returned a seller-only field");
  else if (r.status.orders === "fail") r.notes.push(`orders endpoint answered ${got.status}: ${got.body.slice(0, 60)}`);
  const box2 = await page.locator("#vya-account-orders").count();
  if (!box2) r.notes.push("signed in, but the panel has nowhere to show orders");

  // ── isolation ──────────────────────────────────────────────────────────────────────────────
  // THE PRIVACY BOUNDARY. Signing in at one seller's shop must not sign anyone in at another's.
  // The cookie is host-only for exactly this reason, and this is the only place it is proved.
  step("isolation");
  const neighbour = await firstOtherStore(slug);
  if (neighbour) {
   await page.goto(url(neighbour), { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
   const there = await page.evaluate(async () => {
    const res = await fetch("/api/storefront/account/orders", { headers: { Accept: "application/json" } });
    return res.json().catch(() => null);
   }).catch(() => null);
   r.status.isolation = there && there.signedIn === false ? "pass" : "fail";
   if (r.status.isolation === "fail") r.notes.push(`signing in at ${slug} also signed me in at ${neighbour}`);
  } else r.status.isolation = "skip";

  // ── signout ────────────────────────────────────────────────────────────────────────────────
  step("signout");
  await page.goto(url(slug), { waitUntil: "domcontentloaded", timeout: 25000 });
  // WAIT FOR THE CONTROL TO EXIST. On a store with no account control of its own, the one a shopper
  // presses is OURS — and the page only adds it after measuring that nothing of hers is reachable,
  // up to four seconds in. Clicking at domcontentloaded pressed a button that was not there yet,
  // the panel never opened, and a working sign-out was reported as leaving the session alive.
  await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
  await page.locator("[data-vya-account-open]").first().waitFor({ state: "attached", timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await openControl(page).click({ timeout: 8000 }).catch(() => {});
  // And the panel animates open before its Sign out button can be pressed.
  await page.locator("[data-vya-signout]").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await page.locator("[data-vya-signout]").first().click({ timeout: 8000 }).catch(() => {});
  // The sign-out handler RELOADS the page. Polling starts immediately, every check lands on a
  // destroyed execution context, the error is swallowed and the poll keeps the last value it saw —
  // "still signed in". A successful sign-out reported as a failure, because we asked during the
  // reload it caused. Wait for the page to come back before asking.
  // The handler reloads, and on the heaviest store that reload outlasts the default poll window —
  // every check lands on a destroyed context, the error is swallowed, and "still signed in" is
  // reported for a sign-out that worked. Wait for the reload to finish, then allow a long window:
  // this store serves 1.3 MB documents and 354 pages.
  await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const after = await until(
   () => page.evaluate(async () => {
    const res = await fetch("/api/storefront/account/orders", { headers: { Accept: "application/json" } });
    return res.json().catch(() => null);
   }),
   (v) => Boolean(v) && (v as { signedIn?: boolean }).signedIn === false,
   30000,
  );
  r.status.signout = after && after.signedIn === false ? "pass" : "fail";
  if (r.status.signout === "fail") r.notes.push("signing out left the session alive");
 } catch (e) {
  r.notes.push(String((e as Error).message || e).slice(0, 90));
 }
 await ctx.close();
 return r;
}

let ALL: string[] = [];
async function firstOtherStore(slug: string): Promise<string | null> {
 return ALL.find((s) => s !== slug) ?? null;
}

async function main() {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) { console.error("DATABASE_URL is not set — run with --env-file=.env.local"); process.exit(1); }
 const sql = neon(dbUrl);
 const rows = (await sql`
  SELECT c.store_slug FROM (SELECT DISTINCT store_slug FROM site_captures) c
  JOIN sellers s ON s.slug = c.store_slug ORDER BY c.store_slug
 `) as { store_slug: string }[];
 // The same roster the fleet uses: two captures are the same shop imported twice.
 ALL = fleetStores(rows.map((r) => r.store_slug));
 const stores = ONLY ? ALL.filter((s) => s === ONLY) : ALL;
 if (!stores.length) { console.error(ONLY ? `No captured store called "${ONLY}".` : "No captured stores."); process.exit(1); }

 console.log(`\nAccounts, in a real browser, against ${BASE} — ${stores.length} store(s)`);
 console.log(FOLLOW_LINK
  ? `Signed-in legs follow a real link on ${WRITE_STORE} only — that writes a customer row.\n`
  : `Signed-in legs run on ${WRITE_STORE} with a locally minted cookie — nothing is written.\n`);
 const browser = await chromium.launch({
  channel: "chrome",
  headless: !HEADED,
  args: [`--host-resolver-rules=MAP *.${SUFFIX} 127.0.0.1`],
 });

 const results: Result[] = [];
 for (const slug of stores) {
  const capped = await Promise.race([
   runStore(browser, slug, slug === WRITE_STORE),
   new Promise<Result>((resolve) => setTimeout(() => resolve({ store: slug, status: { bag: "fail" }, notes: [`timed out at: ${at}`] }), 120000)),
  ]);
  results.push(capped);
  console.log(`  ${slug.padEnd(26)}${STEPS.map((s) => (capped.status[s] ?? "  - ").toString().toUpperCase().padEnd(9)).join("")}${capped.notes[0] ? ` ${capped.notes[0].slice(0, 60)}` : ""}`);
 }
 await browser.close();

 console.log(`\n${"STORE".padEnd(26)}${STEPS.map((s) => s.toUpperCase().padEnd(9)).join("")}`);
 const failed = results.filter((r) => Object.values(r.status).includes("fail") || !Object.keys(r.status).length);
 console.log(`\n${results.length - failed.length}/${results.length} stores clean.`);
 for (const f of failed) console.log(`  ${f.store}: ${f.notes.join("; ")}`);
 process.exit(failed.length ? 1 : 0);
}

main();
