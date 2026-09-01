import { test } from "node:test";
import assert from "node:assert/strict";
import {
 isInternational, incotermFor, isDutyMode, hsCodeFor, eelPfc,
 restrictedMaterials, buildDeclaration, AES_THRESHOLD_CENTS, resolveDutyMode,
} from "./customs.ts";

/* ── does it cross a border ─────────────────────────────────────────────── */

test("a border crossing is two different countries", () => {
 assert.equal(isInternational("GB", "US"), true);
 assert.equal(isInternational("US", "US"), false);
 assert.equal(isInternational("gb", "GB"), false); // case doesn't invent a border
});

test("a missing or malformed country is not treated as international", () => {
 // Guessing "international" would attach a declaration to a domestic label and break it.
 assert.equal(isInternational("US", ""), false);
 assert.equal(isInternational(null, "US"), false);
 assert.equal(isInternational("USA", "GB"), false);
});

/* ── who pays ───────────────────────────────────────────────────────────── */

test("absorbing or collecting duty both mean shipping DDP", () => {
 // This is the promise-keeping bit: a store that says "duties covered" and ships DDU has its
 // buyer billed at the door anyway, and pays for the duty twice.
 assert.equal(incotermFor("absorbed"), "DDP");
 assert.equal(incotermFor("collected"), "DDP");
});

test("leaving it to the buyer means DDU", () => {
 assert.equal(incotermFor("buyer_pays"), "DDU");
});

test("only the three real duty modes are accepted", () => {
 assert.equal(isDutyMode("absorbed"), true);
 assert.equal(isDutyMode("ddp"), false);
 assert.equal(isDutyMode(null), false);
});

/* ── tariff codes ───────────────────────────────────────────────────────── */

test("categories map to a code in the right chapter", () => {
 assert.match(hsCodeFor("dresses"), /^6204\./);   // woven apparel
 assert.match(hsCodeFor("handbags"), /^4202\./);  // leather goods
 assert.match(hsCodeFor("sneakers"), /^6404\./);  // footwear
 assert.match(hsCodeFor("sunglasses"), /^9004\./);
});

test("a watch is filed under jewelry but isn't jewelry to customs", () => {
 assert.equal(hsCodeFor("jewelry", "Cartier Tank watch"), "9102.11");
 assert.equal(hsCodeFor("jewelry", "Gold chain necklace"), "7117.90");
});

test("the title overrides even a confident category when it names something else", () => {
 // A wallet listed under handbags is a wallet — different heading, different duty.
 assert.equal(hsCodeFor("handbags", "Gucci card holder"), "4202.31");
 assert.equal(hsCodeFor("coats-jackets", "Vintage fur coat"), "4303.10");
});

test("an unknown category still produces a usable code", () => {
 // A blank tariff number gets the parcel stopped; a defensible one does not.
 assert.match(hsCodeFor("", ""), /^\d{4}\.\d{2}$/);
 assert.match(hsCodeFor(null, null), /^\d{4}\.\d{2}$/);
});

/* ── export filing ──────────────────────────────────────────────────────── */

test("ordinary US exports use the standard exemption", () => {
 assert.equal(eelPfc(50_000, "US"), "NOEEI 30.37(a)");
});

test("a US export over the threshold needs a filing we can't invent", () => {
 // Above $2,500 an AES filing and ITN are required and only the seller can make one, so this
 // returns null and the caller has to say so rather than declare something untrue.
 assert.equal(eelPfc(AES_THRESHOLD_CENTS + 1, "US"), null);
 assert.equal(eelPfc(AES_THRESHOLD_CENTS, "US"), "NOEEI 30.37(a)");
});

test("the threshold is a US rule and doesn't apply to other origins", () => {
 assert.equal(eelPfc(9_000_000, "GB"), "NOEEI 30.37(a)");
});

/* ── restricted materials ───────────────────────────────────────────────── */

test("exotic skins and fur are flagged", () => {
 assert.equal(restrictedMaterials("Hermes Kelly in crocodile").length, 1);
 assert.equal(restrictedMaterials("Vintage python clutch")[0].material, "Python / snakeskin");
 assert.equal(restrictedMaterials("1970s mink coat").length, 1);
});

test("embossed leather is not the animal", () => {
 // "Croc embossed calfskin" is a cow. Flagging it would train sellers to ignore the warning.
 assert.equal(restrictedMaterials("Croc embossed calfskin bag").length, 0);
 assert.equal(restrictedMaterials("Lizard embossed leather belt").length, 0);
});

test("furniture is not fur", () => {
 assert.equal(restrictedMaterials("Vintage furniture throw").length, 0);
});

test("nothing exotic means nothing to warn about", () => {
 assert.deepEqual(restrictedMaterials("Cotton summer dress"), []);
 assert.deepEqual(restrictedMaterials(""), []);
});

test("each material is warned about once, however often it's named", () => {
 assert.equal(restrictedMaterials("Crocodile bag with crocodile strap").length, 1);
});

/* ── the whole declaration ──────────────────────────────────────────────── */

test("a declaration carries every line, with codes and origins filled in", () => {
 const d = buildDeclaration({
  items: [
   { title: "Prada nylon dress", category: "dresses", priceCents: 24000, originCountry: "IT" },
   { title: "Gucci belt", category: "belts", priceCents: 12000 },
  ],
  fromCountry: "GB",
  dutyMode: "absorbed",
  signer: "Blummier",
  parcelWeightOz: 32,
 });
 assert.equal(d.lines.length, 2);
 assert.equal(d.incoterm, "DDP");
 assert.equal(d.totalValueCents, 36000);
 // The item's own origin wins; the one without falls back to where it ships from.
 assert.equal(d.lines[0].originCountry, "IT");
 assert.equal(d.lines[1].originCountry, "GB");
 assert.match(d.lines[1].hsCode, /^4203\./);
});

test("an explicit HS code on the item is never overridden", () => {
 const d = buildDeclaration({
  items: [{ title: "Odd thing", category: "dresses", priceCents: 1000, hsCode: "9999.99" }],
  fromCountry: "US", dutyMode: "buyer_pays", signer: "S", parcelWeightOz: 16,
 });
 assert.equal(d.lines[0].hsCode, "9999.99");
});

test("declared weights add up to something, never zero", () => {
 // A zero-weight customs line is rejected by the carrier.
 const d = buildDeclaration({
  items: [{ title: "A", category: "dresses", priceCents: 100 }, { title: "B", category: "belts", priceCents: 100 }],
  fromCountry: "GB", dutyMode: "collected", signer: "S", parcelWeightOz: 1,
 });
 for (const l of d.lines) assert.ok(l.weightOz >= 1, "every line needs a positive weight");
});

test("a free item still declares a value, because customs rejects zero", () => {
 const d = buildDeclaration({
  items: [{ title: "Gift", category: "dresses", priceCents: 0 }],
  fromCountry: "GB", dutyMode: "buyer_pays", signer: "S", parcelWeightOz: 8,
 });
 assert.ok(d.lines[0].valueCents >= 1);
});

test("a high-value US export surfaces the missing filing rather than hiding it", () => {
 const d = buildDeclaration({
  items: [{ title: "Birkin", category: "handbags", priceCents: 900_000 }],
  fromCountry: "US", dutyMode: "collected", signer: "S", parcelWeightOz: 40,
 });
 assert.equal(d.eelPfc, null);
});

test("undeliverable parcels come back rather than being abandoned", () => {
 const d = buildDeclaration({
  items: [{ title: "A", category: "dresses", priceCents: 100 }],
  fromCountry: "GB", dutyMode: "buyer_pays", signer: "S", parcelWeightOz: 8,
 });
 assert.equal(d.nonDeliveryOption, "return");
});

/* ── who may promise "duties covered" ───────────────────────────────────── */

test("a store on its own carrier account may ship DDP", () => {
 assert.deepEqual(resolveDutyMode("absorbed", true), { mode: "absorbed", downgraded: false });
 assert.deepEqual(resolveDutyMode("collected", true), { mode: "collected", downgraded: false });
});

test("a store on VYA's wallet cannot, and is told so", () => {
 // Duty is invoiced weeks after the label, in an amount nobody knew at purchase. Fronting that for
 // a third party is an unbounded debt, so it is refused structurally rather than by policy.
 assert.deepEqual(resolveDutyMode("absorbed", false), { mode: "buyer_pays", downgraded: true });
 assert.deepEqual(resolveDutyMode("collected", false), { mode: "buyer_pays", downgraded: true });
});

test("leaving it to the buyer is always allowed and never counts as a downgrade", () => {
 assert.deepEqual(resolveDutyMode("buyer_pays", false), { mode: "buyer_pays", downgraded: false });
 assert.deepEqual(resolveDutyMode("buyer_pays", true), { mode: "buyer_pays", downgraded: false });
});

test("a downgraded mode really does ship DDU", () => {
 // The whole point: the incoterm must follow the resolved mode, not the requested one.
 const { mode } = resolveDutyMode("absorbed", false);
 assert.equal(incotermFor(mode), "DDU");
});
