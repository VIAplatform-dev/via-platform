import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--host-resolver-rules=MAP *.vyasites.test 127.0.0.1"] });
const p = await b.newPage({ viewport: { width: 900, height: 1000 } } as never);
await p.goto(process.argv[2], { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForTimeout(3000);
const r = await p.evaluate(() => {
 const out: Record<string, unknown>[] = [];
 for (const el of document.querySelectorAll("[data-vya-add], a[href*='/checkout?item=']")) {
  const e = el as HTMLElement;
  const row: Record<string, unknown> = { cls: String(e.className).replace(/\s+/g, " ").trim().slice(0, 60) };
  for (const pseudo of ["::before", "::after"]) {
   const s = getComputedStyle(e, pseudo);
   if (s.content === "none" && s.backgroundColor === "rgba(0, 0, 0, 0)" && s.borderWidth === "0px") continue;
   row[pseudo] = `content=${s.content} bg=${s.backgroundColor} radius=${s.borderRadius} w=${s.width} h=${s.height} inset=${s.top}/${s.left} border=${s.borderWidth} ${s.borderColor}`;
  }
  out.push(row);
 }
 return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
