import test from "node:test";
import assert from "node:assert/strict";
import { brandConsensus, repeatedName, consensusConfidence, plausibleBrandName, resolveBrandName, rankWeight } from "./brand-consensus.ts";

// A stand-in for the canonical map: it knows the famous houses and, like the real one, has never
// heard of Todd Oldham. That blindness IS the bug under test.
const KNOWN = ["Chanel", "Prada", "Gucci", "Dior", "Versace", "Dolce & Gabbana"];
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
 //
 // INTERLEAVED, because order is evidence now. Six Dior listed BEFORE five Gucci is not a split at
 // all: it says the six best matches are Dior. A real disagreement is the two brands mixed through
 // the results, which is what this builds.
 const titles: string[] = [];
 for (let i = 0; i < 6; i++) {
  titles.push("Dior saddle bag");
  if (i < 5) titles.push("Gucci saddle bag");
 }
 const c = brandConsensus(titles, infer);
 assert.equal(c.brand, null);
 assert.equal(c.reason, "too-close");
 assert.deepEqual(c.runnerUp, { brand: "Gucci", hits: 5 });
});

test("the same counts, ordered, are not a split: the better matches agree", () => {
 // The pair to the test above. Identical tallies, 6 against 5, and the Diors are the top matches.
 const titles = [...Array(6).fill("Dior saddle bag"), ...Array(5).fill("Gucci saddle bag")];
 const c = brandConsensus(titles, infer);
 assert.equal(c.brand, "Dior");
 assert.equal(c.reason, "agreed");
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

test("a designer the map never heard of still becomes the brand when two sources name him", () => {
 // The point of the whole exercise. Blanking the field on a piece we had already identified in our
 // own title and runway is a shrug, not a fix.
 const c = brandConsensus(OLDHAM, infer);
 const r = resolveBrandName({
  consensus: c,
  draftTitle: "Todd Oldham S/S 1995 Black Cutout Mini Dress with Rhinestone O-Ring",
  draftRunway: "Todd Oldham S/S 1995",
 });
 assert.equal(r.brand, "Todd Oldham");
 assert.equal(r.source, "corroborated-name");
 assert.ok(r.confidence >= 0.75 && r.confidence < 0.92, "trusted, but not as a brand we know");
});

test("a name only the web says is never promoted to the brand", () => {
 // Reverse-image results are full of names that are not the designer: the model wearing it, the
 // photographer, the shop reselling it. This dress's own results are thick with Nadia Auermann.
 const titles = [
  ...Array(8).fill("Nadia Auermann 1994 runway photograph"),
  ...Array(3).fill("black cutout mini dress"),
 ];
 const r = resolveBrandName({ consensus: brandConsensus(titles, infer), draftTitle: "Black cutout mini dress" });
 assert.equal(r.brand, null, "the drafter never called her a maker, so she is not the brand");
 assert.equal(r.source, "none");
});

test("a real map-backed agreement still wins outright", () => {
 const c = brandConsensus(Array(8).fill("Prada re-nylon shoulder bag"), infer);
 const r = resolveBrandName({ consensus: c, draftTitle: "Prada nylon bag" });
 assert.equal(r.brand, "Prada");
 assert.equal(r.source, "consensus");
});

test("an uncorroborated result never blanks a brand the drafter already had", () => {
 // Wiping a filled field is its own bug: she then has to retype what we deleted.
 const c = brandConsensus(["black dress", "vintage dress", "90s dress"], infer);
 const r = resolveBrandName({ consensus: c, draftBrand: "Moschino", draftTitle: "Moschino dress" });
 assert.equal(r.brand, "Moschino");
 assert.equal(r.source, "draft");
});

/* ── position is evidence ───────────────────────────────────────────────── */

// A Roberto Cavalli leopard bustier came back branded Dolce & Gabbana. The Lens results, read off
// SerpApi: positions 1, 2 and 3 were Roberto Cavalli listings (Sourced by Scottie, Depop,
// Vestiaire) and the tail was other leopard tops. Counting every title equally let the tail win.
// The seller's reading was the fix: "the first two are perfect matches, the rest aren't."

const MAP: Record<string, string> = {
 "roberto cavalli": "Roberto Cavalli",
 "dolce": "Dolce & Gabbana",
 "cavalli": "Roberto Cavalli",
};
const mapped = (t: string): string | null => {
 const low = t.toLowerCase();
 for (const [k, v] of Object.entries(MAP)) if (low.includes(k)) return v;
 return null;
};

test("the near-exact matches decide the brand, not the long tail", () => {
 const titles = [
  "Roberto Cavalli Underwear 2000s Feather Print Bustier Cami",
  "Roberto Cavalli corset cami top leopard mesh | Depop",
  "Roberto Cavalli Leopard Print Bustier Top M",
  // The tail: other leopard tops, more of them, none of them this piece.
  "Dolce & Gabbana leopard print bustier",
  "Dolce & Gabbana animal print corset top",
  "Dolce & Gabbana leopard silk cami",
  "Dolce & Gabbana leopard bodysuit",
  "Dolce & Gabbana printed mesh top",
 ];
 const c = brandConsensus(titles, mapped);
 assert.equal(c.brand, "Roberto Cavalli");
 assert.equal(c.reason, "agreed");
});

test("weight decays with position, so the tail speaks without shouting", () => {
 assert.equal(rankWeight(0), 1);
 assert.ok(rankWeight(0) > rankWeight(1) && rankWeight(1) > rankWeight(5));
 assert.ok(rankWeight(25) < 0.15);
 // Never negative, never zero: a match at position 40 still counts for something.
 assert.ok(rankWeight(40) > 0);
 assert.equal(rankWeight(-3), 1);
});

test("one well-placed hit is still not a consensus", () => {
 // Position 1 only, and nothing else agrees: the raw floor of three still applies.
 const c = brandConsensus(
  ["Roberto Cavalli leopard top", "some unbranded top", "another unbranded top", "a third"],
  mapped,
 );
 assert.notEqual(c.reason, "agreed");
});

test("a pattern is not a designer", () => {
 // "Leopard Print" recurs on every one of these and must never be read as the maker: it would both
 // veto the real brand and corroborate nothing.
 const name = repeatedName([
  "Leopard Print Bustier Top",
  "Leopard Print Cami Silk",
  "Leopard Print Corset Mesh",
  "Leopard Print Slip Dress",
 ]);
 assert.equal(name, null);
});

test("a real designer the map has never heard of still surfaces", () => {
 // The Todd Oldham protection has to survive all of the above.
 const name = repeatedName([
  "Todd Oldham S/S 1995 Runway Black Cutout Mini Dress",
  "Todd Oldham 1995 documented dress",
  "Vintage Todd Oldham cutout dress",
 ]);
 assert.equal(name, "Todd Oldham");
});

// ── The Botticelli shirt ───────────────────────────────────────────────────────────────────────
//
// Forty-two web matches, every one of them naming Dolce & Gabbana, and the brand field said
// "Venus Pixel Silk": three capitalised words lifted out of the garment's own description. It then
// vetoed Dolce & Gabbana, and the price was worked out for a house that does not exist.

const BOTTICELLI = Array(8).fill("1990s Dolce & Gabbana D&G Birth of Venus Botticelli Pixel Print Silk Shirt");

test("a garment's own description is never harvested as its designer", () => {
 const c = brandConsensus(BOTTICELLI, infer);
 // Nothing to harvest: every one of these titles already names a house the map knows, so its
 // capitalised words are describing the shirt, not naming its maker.
 assert.equal(c.unknownName, null);
 assert.equal(c.brand, "Dolce & Gabbana");
 assert.equal(
  resolveBrandName({ consensus: c, draftTitle: BOTTICELLI[0], draftBrand: "Venus Pixel Silk" }).brand,
  "Dolce & Gabbana",
 );
});

test("a fabric, a cut or a pattern in the phrase means it is not a house", () => {
 assert.equal(plausibleBrandName("Venus Pixel Silk"), false);
 assert.equal(plausibleBrandName("Botticelli Print"), false);
 assert.equal(plausibleBrandName("Black Cutout Mini"), false);
 // And the names that have to survive it.
 assert.equal(plausibleBrandName("Todd Oldham"), true);
 assert.equal(plausibleBrandName("Jean Paul Gaultier"), true);
 assert.equal(plausibleBrandName("Dolce & Gabbana"), true);
 assert.equal(plausibleBrandName(""), false);
 // Four words is a name at the outside; five is a sentence.
 assert.equal(plausibleBrandName("Maison Martin Margiela Artisanal Line"), false);
});

test("a phrase cannot corroborate itself through the drafter's title", () => {
 // The drafter's title is a rewrite of these same web titles, so sharing a WORD with it is not a
 // second source. Only the whole name is.
 const c = { brand: null, hits: 0, total: 8, runnerUp: null, unknownName: "Venus Botticelli Pixel", reason: "unknown-designer" as const };
 assert.equal(resolveBrandName({ consensus: c, draftTitle: "1990s Birth of Venus print shirt" }).brand, null);
 // The same test, with a name that really is in the drafter's own words.
 const oldham = { ...c, unknownName: "Todd Oldham" };
 const r = resolveBrandName({ consensus: oldham, draftTitle: "Todd Oldham S/S 1995 cutout dress" });
 assert.equal(r.brand, "Todd Oldham");
 assert.equal(r.source, "corroborated-name");
});

test("a veto nobody corroborates gives the known brand back", () => {
 // Five Gucci scarves and three pages naming someone the map has never heard of. The unknown name
 // vetoes Gucci, as it should while it might be real.
 const titles = [...Array(5).fill("Gucci silk scarf 1990s"), ...Array(3).fill("Marla Hanson scarf")];
 const c = brandConsensus(titles, infer);
 assert.equal(c.reason, "unknown-designer");
 assert.equal(c.unknownName, "Marla Hanson");
 // Corroborated by the drafter: the unknown designer wins, which is the Todd Oldham case.
 assert.equal(resolveBrandName({ consensus: c, draftBrand: "Marla Hanson" }).brand, "Marla Hanson");
 // Nothing corroborates it: the veto was built on a guess that did not hold, and Gucci, which
 // passed every floor on its own, comes back.
 const back = resolveBrandName({ consensus: c, draftTitle: "1990s silk scarf" });
 assert.equal(back.brand, "Gucci");
 assert.equal(back.source, "consensus");
});

test("the Chanel minority never comes back through the undone veto", () => {
 // Five stray Chanel goods among twenty-six Todd Oldham dresses failed on share, and it has to
 // keep failing on share even when the name that vetoed it turns out to be uncorroborated.
 const c = brandConsensus(OLDHAM, infer);
 assert.equal(c.vetoed, null, "a brand that could not have won is not held for a retry");
 assert.equal(resolveBrandName({ consensus: c, draftTitle: "black cutout mini dress" }).brand, null);
});

test("junk in the brand field is worse than nothing in it", () => {
 // The brand is not free text to a pricer: it is the search term the comps are drawn from.
 const c = { brand: null, hits: 0, total: 4, runnerUp: null, unknownName: null, reason: "none" as const };
 assert.equal(resolveBrandName({ consensus: c, draftBrand: "Venus Pixel Silk" }).brand, null);
 assert.equal(resolveBrandName({ consensus: c, draftBrand: "Todd Oldham" }).brand, "Todd Oldham");
});
