/**
 * Desktop must not pay for the mobile fixes.
 *
 *   node --experimental-strip-types scripts/desktop-regression.mts
 *
 * The iOS zoom fix in globals.css is gated on `(hover: none) and (pointer: coarse)` rather than on a
 * width breakpoint, so the one thing that could go wrong is it leaking onto pointer devices and
 * fattening every form on the desktop site. This asserts the opposite: a real (non-emulated) desktop
 * context must report `coarse:false`, keep its 14px inputs, and overflow nothing.
 *
 * Run it after any change to that rule or to shared layout chrome. Needs `npm run dev` on 3000.
 */
import { chromium } from "playwright";

const r0 = await fetch("http://localhost:3000/api/admin/dev-login?to=/", { redirect: "manual" });
const tok = (r0.headers.getSetCookie?.() ?? []).map((c) => /^via_admin_token=([^;]+)/.exec(c)?.[1]).find(Boolean);
if (!tok) throw new Error("dev-login did not mint a token — is `npm run dev` up with ADMIN_PASSWORD set?");

const browser = await chromium.launch();
// No isMobile / hasTouch: this context must look like a mouse-and-keyboard machine.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "via_admin_token", value: tok, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

let failures = 0;
for (const route of ["/browse", "/", "/login", "/register", "/checkout", "/partner-with-vya"]) {
 await page.goto("http://localhost:3000" + route, { waitUntil: "domcontentloaded", timeout: 60000 });
 await page.waitForTimeout(2500);
 const r = await page.evaluate(() => {
  const coarse = matchMedia("(hover: none) and (pointer: coarse)").matches;
  const sizes = [...document.querySelectorAll("input:not([type=hidden]),select,textarea")]
   .filter((e) => e.getBoundingClientRect().width > 0)
   .map((e) => getComputedStyle(e).fontSize);
  const over = [...document.querySelectorAll("body *")].filter((el) => {
   const s = getComputedStyle(el);
   if (s.display === "none" || s.visibility === "hidden") return false;
   const rc = el.getBoundingClientRect();
   if (rc.right <= document.documentElement.clientWidth + 1) return false;
   for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) {
    if (["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(q).overflowX)) return false;
   }
   return true;
  }).length;
  return { coarse, sizes: [...new Set(sizes)], over };
 });
 const bad = r.coarse || r.over > 0;
 if (bad) failures++;
 console.log(`${bad ? "FAIL" : "ok  "} ${route.padEnd(22)} coarse:${r.coarse} overflow:${r.over} inputFontSizes:[${r.sizes.join(",")}]`);
}

await browser.close();
console.log(failures ? `\n${failures} route(s) regressed on desktop` : "\ndesktop clean");
process.exit(failures ? 1 : 0);
