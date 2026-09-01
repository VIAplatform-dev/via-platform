import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--host-resolver-rules=MAP *.vyasites.test 127.0.0.1"] });
const p = await b.newPage({ viewport: { width: 500, height: 1000 } } as never);
await p.goto(process.argv[2], { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForTimeout(3500);
const r = await p.evaluate(() => {
 const out: string[] = [];
 for (const el of document.querySelectorAll('button, a, [name="add"], [data-vya-add]')) {
  const t = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!/add to cart|buy now|add to bag/i.test(t)) continue;
  const r = (el as HTMLElement).getBoundingClientRect();
  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden") continue;
  out.push(`${el.tagName.toLowerCase()}${(el as HTMLElement).dataset.vyaAdd ? "[VYA]" : ""} "${t.slice(0,16)}" x=${Math.round(r.x)} y=${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} z=${s.zIndex}`);
 }
 return out;
});
console.log("VISIBLE add/buy controls:", r.length);
for (const x of r) console.log("  " + x);
await b.close();
