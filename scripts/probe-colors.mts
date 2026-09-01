import { chromium } from "playwright";
import { neon } from "@neondatabase/serverless";
const SUFFIX = (process.env.STORE_HOST_SUFFIX || "vyasites.test").replace(/^\./, "");
const rows = await neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!)`
 SELECT c.store_slug FROM (SELECT DISTINCT store_slug FROM site_captures) c
 JOIN sellers s ON s.slug = c.store_slug ORDER BY c.store_slug` as { store_slug: string }[];
const b = await chromium.launch({ channel: "chrome", headless: true, args: [`--host-resolver-rules=MAP *.${SUFFIX} 127.0.0.1`] });
console.log("\nSTORE                        ADD TO CART (bg / text)                 BUY NOW");
console.log("-".repeat(96));
for (const { store_slug: slug } of rows) {
 const ctx = await b.newContext({ viewport: { width: 900, height: 1000 } });
 const p = await ctx.newPage();
 const origin = `http://${slug}.${SUFFIX}:3333`;
 try {
  await p.goto(origin, { waitUntil: "domcontentloaded", timeout: 12000 });
  const links = [...new Set(await p.locator('a[href*="/products/"], a[href*="/shop/p/"]').evaluateAll((e) => e.map((a) => (a as HTMLAnchorElement).getAttribute("href") || "")))].slice(0, 3);
  let done = false;
  for (const l of links) {
   await p.goto(new URL(l, origin).toString(), { waitUntil: "domcontentloaded", timeout: 12000 }).catch(() => null);
   await p.waitForTimeout(2200);
   const r = await p.evaluate(() => {
    const a = document.querySelector("[data-vya-add]") as HTMLElement | null;
    const s2 = document.querySelector("[data-vya-secondary]") as HTMLElement | null;
    if (!a) return null;
    const g = (e: HTMLElement) => { const c = getComputedStyle(e); return `${c.backgroundColor} / ${c.color}`; };
    return { add: g(a), buy: s2 ? g(s2) : "-", radius: getComputedStyle(a).borderRadius };
   });
   if (r) { console.log(`${slug.padEnd(28)} ${r.add.padEnd(40)} ${r.buy}`); done = true; break; }
  }
  if (!done) console.log(`${slug.padEnd(28)} (no product page with buttons)`);
 } catch { console.log(`${slug.padEnd(28)} (error)`); }
 await ctx.close().catch(() => {});
}
await b.close();
