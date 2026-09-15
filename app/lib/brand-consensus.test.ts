import test from "node:test";
import assert from "node:assert/strict";
import { brandConsensus, repeatedName, consensusConfidence } from "./brand-consensus.ts";

// A stand-in for the canonical map: it knows the famous houses and, like the real one, has never
// heard of Todd Oldham. That blindness IS the bug under test.
const KNOWN = ["Chanel", "Prada", "Gucci", "Dior", "Versace"];
const infer = (t: string) => KNOWN.find((b) => t.toLowerCase().includes(b.toLowerCase())) ?? null;

/** The real shape of the Todd Oldham result: 26 of 31 name him, 5 are stray Chanel goods. */
const OLDHAM = [
 ...Array.from({ length: 26 }, (_, i) =>
  ["Todd Oldham S/S 1995 Runway Black Cutout Mini Dress",
   "for sale) documented, archival Todd Oldham Spring Summer S/S 1995",
   "Vintage Todd Oldham black cutout dress 1990s",
   "Todd Oldham 1995 rhinestone O-ring mini dress"][i % 4]),
 "CHANEL Vintage CC Logos Chain Shoulder Bag",
 "Chanel black leather ballet flats",
 "Chanel costume pearl necklace",
 "Chanel quilted lambskin wallet",
 "Chanel vintage brooch gold tone",
];

test("the Chanel misbrand cannot happen again", () => {
 // 5 of 31 is 16%. It scored Chanel 5 to Todd Oldham 0, because the map has never heard of him,
 // and then overrode the model at 0.85 and priced a 1,681 dress against 16,013 of handbags.
 const c = brandConsensus(OLDHAM, infer);
 assert.equal(c.brand, null, "a 16% minority is not the web agreeing");
 assert.equal(c.reason, "unknown-designer");
 assert.equal(c.unknownName, "Todd Oldham", "the name the map cannot see is spotted anyway");
 assert.equal(consensusConfidence(c), 0, "nothing to be confident about");
});

test("a real agreement still comes through", () => {
 // The case this whole mechanism exists for must keep working.
 const titles = [
  "Prada Re-Nylon shoulder bag black", "PRADA nylon bag vintage", "Prada Milano nylon shoulder bag",
  "Prada black re-nylon bag authentic", "Prada shoulder bag", "black nylon shoulder bag",
 ];
 const c = brandConsensus(titles, infer);
 assert.equal(c.brand, "Prada");
 assert.equal(c.reason, "agreed");
 assert.ok(consensusConfidence(c) > 0.7, "five of six is worth trusting");
});

test("one mention is never agreement", () => {
 const c = brandConsensus(["Chanel black dress", "black dress", "vintage black dress", "90s dress"], infer);
 assert.equal(c.brand, null);
 assert.equal(c.reason, "too-few");
});

test("a thin share is refused even when nothing competes with it", () => {
 // Three Gucci mentions among twenty results is not twenty results agreeing on Gucci.
 const titles = [...Array(3).fill("Gucci leather bag"), ...Array(17).fill("brown leather handbag")];
 const c = brandConsensus(titles, infer);
 assert.equal(c.brand, null);
 assert.equal(c.reason, "too-thin");
 assert.equal(c.hits, 3);
 assert.equal(c.total, 20);
});

test("a near-split is a split, not a winner", () => {
 // Six versus five is the web disagreeing. Picking the six is a coin toss dressed as evidence.
 const titles = [...Array(6).fill("Dior saddle bag"), ...Array(5).fill("Gucci saddle bag")];
 const c = brandConsensus(titles, infer);
 assert.equal(c.brand, null);
 assert.equal(c.reason, "too-close");
 assert.deepEqual(c.runnerUp, { brand: "Gucci", hits: 5 });
});

test("a clear winner over a runner-up is still accepted", () => {
 const titles = [...Array(9).fill("Versace silk shirt baroque"), ...Array(2).fill("Gucci silk shirt")];
 const c = brandConsensus(titles, infer);
 assert.equal(c.brand, "Versace");
 assert.equal(c.reason, "agreed");
});

test("no brand anywhere is reported as none, not as a guess", () => {
 const c = brandConsensus(["black cutout mini dress", "90s party dress", "little black dress"], infer);
 assert.equal(c.brand, null);
 assert.equal(c.reason, "none");
 assert.equal(c.runnerUp, null);
});

test("a designer the map knows is not treated as an unknown name", () => {
 // "Prada Milano" repeats as a proper noun, but the map knows Prada, so it must not block itself.
 const titles = Array(6).fill("Prada Milano nylon shoulder bag");
 assert.equal(brandConsensus(titles, infer).brand, "Prada");
});

test("colours and garment words are never mistaken for a designer", () => {
 // Without this "Black Cutout Mini" reads as a name and blocks every legitimate consensus.
 assert.equal(repeatedName(Array(6).fill("Black Cutout Mini Dress")), null);
 assert.equal(repeatedName(Array(6).fill("Vintage Black Dress")), null);
 assert.equal(repeatedName(Array(6).fill("Made In Italy")), null);
 assert.equal(repeatedName(Array(6).fill("Spring Summer Runway")), null);
});

test("a repeated designer name is found across differently-worded titles", () => {
 assert.equal(repeatedName([
  "Jean Paul Gaultier mesh top", "vintage Jean Paul Gaultier", "JPG top by Jean Paul Gaultier", "mesh top",
 ]), "Jean Paul Gaultier");
 // And a name on only one page is not the piece's designer.
 assert.equal(repeatedName(["Todd Oldham dress", "black dress", "party dress"]), null);
});

test("an empty result set is handled", () => {
 const c = brandConsensus([], infer);
 assert.equal(c.brand, null);
 assert.equal(c.total, 0);
 assert.equal(c.reason, "none");
});

test("confidence tracks how much of the web actually agreed", () => {
 const strong = brandConsensus(Array(10).fill("Chanel flap bag"), infer);
 const weaker = brandConsensus([...Array(4).fill("Chanel flap bag"), ...Array(6).fill("black flap bag")], infer);
 assert.ok(consensusConfidence(strong) > consensusConfidence(weaker), "half the web beats a third");
 assert.ok(consensusConfidence(strong) <= 0.92, "never certain from titles alone");
});
