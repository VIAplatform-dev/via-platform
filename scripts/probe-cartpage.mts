import { chromium } from "playwright";
const origin = process.argv[2];
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--host-resolver-rules=MAP *.vyasites.test 127.0.0.1"] });
const p = await b.newPage();
await p.goto(origin, { waitUntil: "domcontentloaded", timeout: 20000 });
const links = [...new Set(await p.locator('a[href*="/products/"]').evaluateAll((e) => e.map((a) => (a as HTMLAnchorElement).getAttribute("href") || "")))].slice(0, 5);
let added = "";
for (const l of links) {
 await p.goto(new URL(l, origin).toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
 await p.locator("[data-vya-add] >> visible=true").first().click({ timeout: 6000 }).catch(() => {});
 await p.waitForTimeout(2000);
 const c = await p.evaluate(async () => (await (await fetch("/cart.js")).json()));
 if (c.item_count >= 1) { added = c.items[0].title; break; }
}
console.log("added to bag:", added || "(nothing)");
await p.goto(`${origin}/cart`, { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForTimeout(2500);
const r = await p.evaluate((title) => {
 const region = document.querySelector("[data-vya-fallback-cart]") as HTMLElement | null;
 const bodyHas = (document.body.textContent || "").includes(title);
 return {
  fallbackPresent: !!region,
  regionText: (region?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140),
  titleAnywhereOnPage: bodyHas,
  serverCount: null as number | null,
 };
}, added);
r.serverCount = await p.evaluate(async () => (await (await fetch("/cart.js")).json()).item_count);
console.log(r);
await b.close();
