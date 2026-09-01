import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--host-resolver-rules=MAP *.vyasites.test 127.0.0.1"] });
const p = await b.newPage({ viewport: { width: 500, height: 1000 } } as never);
await p.goto(process.argv[2], { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForTimeout(3500);
const r = await p.evaluate(() => {
 const vya = document.querySelector("[data-vya-add]") as HTMLElement | null;
 if (!vya) return { error: "no VYA button" };
 const vb = vya.getBoundingClientRect();
 const desc = (e: Element) => {
  const el = e as HTMLElement; const s = getComputedStyle(el); const r = el.getBoundingClientRect();
  return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className ? "." + String(el.className).split(" ").slice(0,3).join(".") : ""} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)} bg=${s.backgroundColor} r=${s.borderRadius}`;
 };
 // Everything whose box OVERLAPS the VYA button — that is what can peek out.
 const overlapping: string[] = [];
 for (const el of document.querySelectorAll("body *")) {
  if (el === vya || vya.contains(el) || el.contains(vya)) continue;
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width < 40 || r.height < 20) continue;
  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) continue;
  const hit = !(r.right < vb.left || r.left > vb.right || r.bottom < vb.top || r.top > vb.bottom);
  if (hit) overlapping.push(desc(el));
 }
 return { vyaButton: desc(vya), overlapping: overlapping.slice(0, 8) };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
