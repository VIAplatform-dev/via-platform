// Does the theme replace VYA's Add button after the page loads?
import { chromium } from "playwright";

const PAGE_URL = process.argv[2] || "http://loved-again.vyasites.test:3333/products/louis-vuitton-pochette";
const SUFFIX = "vyasites.test";

const browser = await chromium.launch({ channel: "chrome", headless: true, args: [`--host-resolver-rules=MAP *.${SUFFIX} 127.0.0.1`] });
const page = await browser.newPage();

const cartCalls: string[] = [];
page.on("request", (r) => { if (/\/api\/storefront\/cart|\/cart\/add/.test(r.url())) cartCalls.push(`${r.method()} ${new URL(r.url()).pathname}`); });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 80)));

const count = () => page.evaluate(() => ({
 vya: document.querySelectorAll("[data-vya-add]").length,
 theme: document.querySelectorAll('[name="add"]').length,
 vyaCartLoaded: typeof (window as unknown as { VYACart?: unknown }).VYACart !== "undefined",
}));

await page.goto(PAGE_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
const atParse = await count();
await page.waitForTimeout(4000); // let the theme hydrate
const afterHydration = await count();

console.log("\n--- BUTTONS ---");
console.log("right after HTML parsed :", atParse);
console.log("4s later (hydrated)     :", afterHydration);
console.log(atParse.vya !== afterHydration.vya
 ? `\n>>> THE THEME REPLACED OUR BUTTONS: ${atParse.vya} -> ${afterHydration.vya}`
 : "\n>>> our buttons survived hydration");

// Is our button actually clickable, and does clicking it call the cart API?
const btn = page.locator("[data-vya-add]").first();
console.log("\n--- CLICK ---");
if (await btn.count()) {
 const box = await btn.boundingBox();
 console.log("visible on screen:", box ? `yes (${Math.round(box.width)}x${Math.round(box.height)})` : "NO — zero size or hidden");
 // What sits on top of it at its own centre point? An overlay eats the click silently.
 if (box) {
  const covering = await page.evaluate(({ x, y }) => {
   const el = document.elementFromPoint(x, y);
   return el ? `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}` : "(nothing)";
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  console.log("element at its centre:", covering);
 }
 await btn.click({ timeout: 8000, force: true }).catch((e) => console.log("click threw:", String(e.message).slice(0, 60)));
 await page.waitForTimeout(2500);
 console.log("cart requests made:", cartCalls.length ? cartCalls.join(", ") : "NONE — the click never reached our handler");
 const after = await page.evaluate(async () => (await (await fetch("/cart.js")).json()).item_count);
 console.log("items in bag now:", after);
} else {
 console.log("no [data-vya-add] on the page at all");
}
// WHY is it hidden? Walk up from each button and name the ancestor that kills it.
const why = await page.evaluate(() => {
 return [...document.querySelectorAll("[data-vya-add]")].map((el, i) => {
  const r = (el as HTMLElement).getBoundingClientRect();
  let culprit = "(visible)";
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
   const s = getComputedStyle(n);
   if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0 || (n as HTMLElement).hidden) {
    culprit = `${n.tagName.toLowerCase()}${n.className ? "." + String(n.className).split(" ").slice(0,2).join(".") : ""} → ${s.display === "none" ? "display:none" : s.visibility === "hidden" ? "visibility:hidden" : (n as HTMLElement).hidden ? "[hidden]" : "opacity:0"}`;
    break;
   }
  }
  return { i, size: `${Math.round(r.width)}x${Math.round(r.height)}`, hiddenBy: culprit, tag: el.tagName.toLowerCase(), cls: String((el as HTMLElement).className).slice(0, 40) };
 });
});
console.log("\n--- WHY EACH BUTTON IS HIDDEN ---");
for (const b of why) console.log(`  #${b.i} <${b.tag} class="${b.cls}"> ${b.size}  ${b.hiddenBy}`);

// Click the VISIBLE button and watch what our own handler does.
const visible = page.locator("[data-vya-add] >> visible=true").first();
console.log("\n--- CLICKING THE VISIBLE BUTTON ---");
const probe = await page.evaluate(() => {
 const el = [...document.querySelectorAll("[data-vya-add]")].find((e) => (e as HTMLElement).offsetWidth > 0) as HTMLElement | undefined;
 if (!el) return { found: false };
 (window as any).__vyaFired = false;
 document.addEventListener("click", () => { (window as any).__vyaFired = true; }, true);
 return { found: true, inbag: el.getAttribute("data-inbag"), id: el.getAttribute("data-vya-add"), text: (el.textContent||"").trim().slice(0,30) };
});
console.log("button:", probe);
cartCalls.length = 0;
await visible.click({ timeout: 8000 }).catch((e) => console.log("click threw:", String(e.message).slice(0,60)));
await page.waitForTimeout(2500);
const fired = await page.evaluate(() => (window as any).__vyaFired);
console.log("a click event reached document:", fired);
console.log("cart requests after click:", cartCalls.length ? cartCalls.join(", ") : "NONE");

// Now bypass the click entirely and call our own cart code directly.
const direct = await page.evaluate(async () => {
 const el = [...document.querySelectorAll("[data-vya-add]")].find((e) => (e as HTMLElement).offsetWidth > 0) as HTMLElement | undefined;
 const id = el?.getAttribute("data-vya-add");
 try { await (window as any).VYACart.add(id); } catch (e) { return { ok: false, err: String((e as Error).message).slice(0,60) }; }
 const n = (await (await fetch("/cart.js")).json()).item_count;
 return { ok: true, count: n };
});
console.log("calling VYACart.add() directly:", direct);

console.log("\nVYACart loaded:", afterHydration.vyaCartLoaded);
console.log("page errors:", errors.length ? errors.slice(0, 3).join(" | ") : "none");
await browser.close();
