import { chromium } from "playwright";
import { neon } from "@neondatabase/serverless";
const SUFFIX = (process.env.STORE_HOST_SUFFIX || "vyasites.test").replace(/^\./, "");
const rows = await neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!)`
 SELECT c.store_slug FROM (SELECT DISTINCT store_slug FROM site_captures) c
 JOIN sellers s ON s.slug = c.store_slug ORDER BY c.store_slug` as { store_slug: string }[];
const b = await chromium.launch({ channel: "chrome", headless: true, args: [`--host-resolver-rules=MAP *.${SUFFIX} 127.0.0.1`] });
console.log("\nSTORE                        DRAWER bg / ink                          FONT");
console.log("-".repeat(100));
for (const { store_slug: slug } of rows) {
 const ctx = await b.newContext({ viewport: { width: 900, height: 1000 } });
 const p = await ctx.newPage();
 try {
  await p.goto(`http://${slug}.${SUFFIX}:3333`, { waitUntil: "domcontentloaded", timeout: 12000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
   const d = document.querySelector("#vya-cart-drawer") as HTMLElement | null;
   if (!d) return null;
   const c = getComputedStyle(d);
   const body = getComputedStyle(document.body);
   return { bg: c.backgroundColor, ink: c.color, font: c.fontFamily.split(",")[0].replace(/['"]/g, ""), matchesBody: c.backgroundColor === body.backgroundColor && c.color === body.color };
  });
  console.log(r ? `${slug.padEnd(28)} ${(r.bg + " / " + r.ink).padEnd(40)} ${r.font}${r.matchesBody ? "  ✓ matches page" : ""}` : `${slug.padEnd(28)} (no drawer)`);
 } catch { console.log(`${slug.padEnd(28)} (error)`); }
 await ctx.close().catch(() => {});
}
await b.close();
