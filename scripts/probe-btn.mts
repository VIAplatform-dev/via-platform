import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--host-resolver-rules=MAP *.vyasites.test 127.0.0.1"] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } } as never);
await p.goto(process.argv[2], { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
 const box = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; if (!e) return null; const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), vis: s.display !== "none" && s.visibility !== "hidden" }; };
 return { cartBtn: box("#vya-cart-btn"), badge: box("[href*='vyaplatform'], .vya-powered, [class*='powered']") };
});
console.log("VYA cart button:", r.cartBtn);
console.log("powered-by badge:", r.badge);
if (r.cartBtn && r.badge) {
 const overlap = !(r.cartBtn.x + r.cartBtn.w < r.badge.x || r.badge.x + r.badge.w < r.cartBtn.x || r.cartBtn.y + r.cartBtn.h < r.badge.y || r.badge.y + r.badge.h < r.cartBtn.y);
 console.log("overlapping:", overlap ? "YES (BAD)" : "no");
}
await b.close();
