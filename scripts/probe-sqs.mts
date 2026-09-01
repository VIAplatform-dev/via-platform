import { chromium } from "playwright";
const PAGE_URL = process.argv[2];
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--host-resolver-rules=MAP *.vyasites.test 127.0.0.1"] });
const p = await b.newPage();
await p.goto(PAGE_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForTimeout(3000);
const before = await p.evaluate(() => [...document.querySelectorAll("body *")].length);
await p.locator("[data-vya-add] >> visible=true").first().click({ timeout: 8000 }).catch(() => {});
await p.waitForTimeout(3000);
const panels = await p.evaluate(() => {
 const out: string[] = [];
 for (const el of document.querySelectorAll("body *")) {
  const r = (el as HTMLElement).getBoundingClientRect();
  const s = getComputedStyle(el);
  if (r.width < 180 || r.height < 90) continue;
  if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.2) continue;
  if (!["fixed", "absolute"].includes(s.position)) continue;
  if (Number(s.zIndex) < 10 && s.zIndex !== "auto") continue;
  const txt = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!/cart|bag|added/i.test(txt)) continue;
  out.push(`${el.tagName.toLowerCase()}${(el as HTMLElement).id ? "#" + (el as HTMLElement).id : ""}${el.className ? "." + String(el.className).split(" ").slice(0,3).join(".") : ""} z=${s.zIndex} "${txt}"`);
 }
 return out;
});
console.log("elements grew:", before, "→", await p.evaluate(() => [...document.querySelectorAll("body *")].length));
console.log("\nVISIBLE CART-ISH PANELS AFTER ADD:");
for (const x of panels) console.log("  " + x);
await b.close();
