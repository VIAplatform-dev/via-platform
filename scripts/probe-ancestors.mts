import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--host-resolver-rules=MAP *.vyasites.test 127.0.0.1"] });
const p = await b.newPage({ viewport: { width: 500, height: 1000 } } as never);
await p.goto(process.argv[2], { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForTimeout(3500);
const r = await p.evaluate(() => {
 const vya = document.querySelector("[data-vya-add]") as HTMLElement | null;
 if (!vya) return { error: "no VYA button" };
 const out: string[] = [];
 const d = (el: HTMLElement, tag: string) => {
  const s = getComputedStyle(el), r = el.getBoundingClientRect();
  return `${tag} <${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ").slice(0,3).join(".") : ""}> ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)} bg=${s.backgroundColor} radius=${s.borderRadius} border=${s.borderWidth} shadow=${s.boxShadow.slice(0,28)}`;
 };
 out.push(d(vya, "VYA "));
 let n: HTMLElement | null = vya.parentElement;
 for (let i = 0; n && i < 5; i++, n = n.parentElement) out.push(d(n, `up${i+1}`));
 // siblings of the VYA button, which is where a leftover theme button would sit
 for (const sib of Array.from(vya.parentElement?.children || [])) {
  if (sib === vya) continue;
  const el = sib as HTMLElement, rr = el.getBoundingClientRect();
  if (rr.width > 40 && rr.height > 10) out.push(d(el, "sib "));
 }
 return { out };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
