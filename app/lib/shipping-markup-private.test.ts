import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MARKUP, buyerShippingCents, markupMarginCents } from "./shipping-markup-core.ts";

// HOW VYA PRICES POSTAGE IS VYA'S BUSINESS.
//
// The buyer pays the real carrier rate for their parcel plus a margin (shipping-markup-core.ts).
// That number is ours. A seller sees what her buyer was charged and what she is paid; she does not
// see the percentage, the floor, or the margin on a label, and no screen may put them there.
//
// This is not secrecy for its own sake. A percentage shown on a settings page is a number sellers
// will price against, argue with, and quote to each other, and it changes as carrier contracts
// change. The promise VYA makes is the buyer's price, not the arithmetic behind it.
//
// WHAT WENT WRONG BEFORE. Settings printed the flat fallback tiers ($8 / $14 / $24) as "what buyers
// pay, we set these for you", identically for every region. They were never that: they are the
// table used when the carrier cannot be reached, or when a store has chosen to price its own
// postage. Every store is on live pricing unless it says otherwise. So the page asserted a made-up
// price list to almost everyone, and implied a fixed-number model besides.

const SKIP = new Set(["node_modules", ".next", ".git", ".vercel", "coverage", "dist"]);

/** Every file a seller or shopper can cause to render: pages and components, not server libs. */
function screens(dir: string, out: string[] = []): string[] {
 let entries: string[];
 try { entries = readdirSync(dir); } catch { return out; }
 for (const name of entries) {
  if (SKIP.has(name) || name.startsWith(".")) continue;
  const p = join(dir, name);
  if (statSync(p).isDirectory()) screens(p, out);
  else if ((name.endsWith(".tsx") || name.endsWith(".ts")) && !name.includes(".test.")) out.push(p);
 }
 return out;
}

test("no screen imports the markup policy", () => {
 // One server module resolves a buyer's postage; nothing that renders may reach past it.
 const allowed = new Set(["app/lib/shipping-price.ts"]);
 const leaks: string[] = [];
 for (const root of ["app", "mobile"]) {
  for (const file of screens(root)) {
   if (allowed.has(file)) continue;
   const src = readFileSync(file, "utf8");
   if (/shipping-markup-core/.test(src)) leaks.push(file);
  }
 }
 assert.deepEqual(leaks, [], `The markup belongs behind resolveBuyerShipping:\n${leaks.join("\n")}`);
});

test("no seller-facing text names the markup", () => {
 // The figures themselves, written out. A page that says "15%" beside postage has given away the
 // policy whether or not it imported the module.
 const pct = `${Math.round(DEFAULT_MARKUP.pct * 100)}%`;
 const floor = (DEFAULT_MARKUP.minMarginCents / 100).toFixed(2);
 const leaks: string[] = [];
 for (const file of screens("app/infrastructure").concat(screens("app/store"), screens("mobile/app"))) {
  const src = readFileSync(file, "utf8");
  // Only near a word about postage: "15%" is an ordinary number on an analytics page.
  for (const line of src.split("\n")) {
   const t = line.trim();
   if (t.startsWith("//") || t.startsWith("*") || t.startsWith("{/*")) continue; // comments explain, screens assert
   // "label" alone is too common to key on: every form field has one, and a parcel label is a
   // different thing entirely. A postage word has to be doing postage work on the line.
   if (!/postage|parcel|courier|shipping/i.test(line)) continue;
   if (line.includes(pct) || line.includes(`$${floor}`) || /markup|margin on (the )?label/i.test(line)) {
    leaks.push(`${file}  ${line.trim().slice(0, 90)}`);
   }
  }
 }
 assert.deepEqual(leaks, [], `Postage pricing is not the seller's to see:\n${leaks.join("\n")}`);
});

test("the rule the seller never sees still holds", () => {
 // Guarded here because nothing user-facing can guard it: every quote clears the floor, and no
 // route loses money. A percentage alone would not do that on cheap postage.
 for (const cost of [100, 568, 600, 1402, 3107, 9000]) {
  assert.ok(markupMarginCents(cost) >= DEFAULT_MARKUP.minMarginCents, `margin at ${cost}`);
  assert.ok(buyerShippingCents(cost) > cost, `never below cost at ${cost}`);
  assert.equal(buyerShippingCents(cost) % 100, 0, `whole units at ${cost}`);
 }
 // Free stays free: a zero label is not marked up to the floor.
 assert.equal(buyerShippingCents(0), 0);
});
