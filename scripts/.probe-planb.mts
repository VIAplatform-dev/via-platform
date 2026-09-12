import { chromium } from "playwright";
const url = process.argv[2];
const b = await chromium.launch({ args: ["--run-all-compositor-stages-before-draw", `--host-resolver-rules=MAP *.vyasites.test 127.0.0.1`] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const failed: string[] = [];
p.on("requestfailed", (r) => { if (failed.length < 12) failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 110)}`); });
p.on("response", (r) => { if (r.status() >= 400 && failed.length < 12) failed.push(`HTTP ${r.status()} ${r.url().slice(0, 110)}`); });
await p.goto(url, { waitUntil: "load", timeout: 90000 });
await p.waitForTimeout(4000);
console.log(JSON.stringify(await p.evaluate(() => ({
 bodyOpacity: getComputedStyle(document.body).opacity,
 htmlClass: document.documentElement.className,
 imgs: document.images.length,
 loaded: [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length,
 height: document.body.scrollHeight,
 title: document.title,
})), null, 1));
console.log("failed/4xx:", JSON.stringify(failed, null, 1));
await p.screenshot({ path: process.argv[3] });
await b.close();
