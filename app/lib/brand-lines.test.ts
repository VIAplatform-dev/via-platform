import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBrandLine, isFairComp, tierDistance, compExclusions, compQueryBrand, BRAND_LINES } from "./brand-lines.ts";

// The case this exists for: a Ralph Lauren Fall 2008 runway gown priced at $53
// because every comp came from Lauren Ralph Lauren, the department-store line.

test("the specific line always beats its parent house", () => {
 assert.equal(resolveBrandLine("Lauren Ralph Lauren plaid dress")?.label, "Lauren Ralph Lauren");
 assert.equal(resolveBrandLine("Ralph Lauren Collection silk gown")?.label, "Ralph Lauren Collection");
 assert.equal(resolveBrandLine("Polo Ralph Lauren oxford")?.label, "Polo Ralph Lauren");
 assert.equal(resolveBrandLine("Ralph Lauren dress")?.label, "Ralph Lauren");
});

test("a Collection gown is never comped against Lauren Ralph Lauren", () => {
 const gown = resolveBrandLine("Ralph Lauren Collection plaid gown");
 assert.equal(isFairComp(gown, "Lauren Ralph Lauren ruched evening gown"), false);
 assert.equal(isFairComp(gown, "Chaps Ralph Lauren plaid dress"), false);
 assert.equal(isFairComp(gown, "Ralph Lauren Purple Label gown"), true);
});

test("neighbouring tiers are still fair comps", () => {
 const polo = resolveBrandLine("Polo Ralph Lauren shirt");
 assert.equal(isFairComp(polo, "Lauren Ralph Lauren blouse"), true); // one step apart
});

test("comps from another house are left to the existing filters", () => {
 const gown = resolveBrandLine("Ralph Lauren Collection gown");
 assert.equal(isFairComp(gown, "Oscar de la Renta silk gown"), true);
 assert.equal(isFairComp(gown, "unbranded vintage plaid dress"), true);
});

test("every diffusion line is walled off from its runway parent", () => {
 const pairs: [string, string][] = [
  ["Giorgio Armani jacket", "Armani Exchange jacket"],
  ["Versace silk shirt", "Versace Jeans Couture shirt"],
  ["Versace silk shirt", "Versus Versace top"],
  ["Dolce & Gabbana dress", "D&G Dolce dress"],
  ["Marc Jacobs coat", "Marc by Marc Jacobs coat"],
  ["Valentino gown", "RED Valentino dress"],
  ["Alexander McQueen blazer", "McQ Alexander McQueen tee"],
  ["Chloe blouse", "See by Chloe blouse"],
  ["Vivienne Westwood corset", "Vivienne Westwood Anglomania dress"],
  ["Comme des Garcons jacket", "Comme des Garcons Play tee"],
  ["Yohji Yamamoto coat", "Y-3 sneakers"],
  ["Jean Paul Gaultier mesh top", "JPG Jeans top"],
  ["Moschino jacket", "Love Moschino bag"],
  ["Burberry Prorsum trench", "Burberry Brit coat"],
  ["Donna Karan Collection dress", "DKNY dress"],
  ["Missoni knit", "M Missoni knit"],
  ["Blumarine cardigan", "Blugirl top"],
  ["Roberto Cavalli gown", "Just Cavalli dress"],
  ["Alexander Wang dress", "T by Alexander Wang tee"],
  ["Jil Sander coat", "Jil Sander Navy skirt"],
  ["Halston gown", "Halston Heritage dress"],
  ["Carolina Herrera gown", "CH Carolina Herrera blouse"],
  ["Oscar de la Renta gown", "O Oscar dress"],
  ["Vera Wang gown", "Simply Vera dress"],
  ["Zac Posen gown", "ZAC Zac Posen dress"],
  ["Christian Lacroix jacket", "Bazar de Christian Lacroix skirt"],
  ["Saint Laurent blazer", "YSL Variation blouse"],
  ["Calvin Klein Collection dress", "Calvin Klein Jeans denim"],
  ["Jason Wu Collection gown", "Grey Jason Wu dress"],
  ["Balmain blazer", "Pierre Balmain shirt"],
  ["Fendi bag", "Fendissime jacket"],
  ["Krizia dress", "Krizia Poi top"],
  ["Isaac Mizrahi gown", "Isaac Mizrahi Live blouse"],
  ["Sonia Rykiel knit", "Sonia by Sonia Rykiel top"],
  ["Thakoon dress", "Thakoon Addition skirt"],
 ];
 for (const [piece, diffusionComp] of pairs) {
  const line = resolveBrandLine(piece);
  assert.ok(line, `no line resolved for "${piece}"`);
  assert.equal(isFairComp(line, diffusionComp), false, `"${diffusionComp}" wrongly accepted as a comp for "${piece}"`);
 }
});

test("the comp query names the line, not the bare house", () => {
 assert.equal(compQueryBrand(resolveBrandLine("Ralph Lauren Collection gown"), "Ralph Lauren"), "Ralph Lauren Collection");
});

test("exclusions name the rival LINE as a phrase, not a shared word", () => {
 const ex = compExclusions(resolveBrandLine("Ralph Lauren Collection gown"));
 // The line that caused the $53 price must be excludable even though it shares
 // every word with its parent.
 assert.ok(ex.includes("lauren ralph lauren"), `expected the diffusion line, got ${JSON.stringify(ex)}`);
 assert.ok(ex.includes("polo ralph lauren"), `expected the bridge line, got ${JSON.stringify(ex)}`);
 // A bare shared word would exclude the piece itself.
 assert.ok(!ex.includes("ralph"), "must not exclude the house's own name");
 assert.ok(!ex.includes("lauren"), "must not exclude the house's own name");
});

test("exclusions never remove the wanted line", () => {
 for (const piece of ["Giorgio Armani jacket", "Versace gown", "Valentino dress", "Burberry Prorsum trench"]) {
  const line = resolveBrandLine(piece)!;
  const mine = line.label.toLowerCase();
  for (const ex of compExclusions(line)) {
   assert.ok(!mine.includes(ex), `"${ex}" would exclude "${line.label}" itself`);
  }
 }
});

test("tier distance is symmetric and ordered", () => {
 assert.equal(tierDistance("runway", "diffusion"), 3);
 assert.equal(tierDistance("diffusion", "runway"), 3);
 assert.equal(tierDistance("runway", "runway"), 0);
});

test("no line is defined twice for the same house", () => {
 const seen = new Set<string>();
 for (const l of BRAND_LINES) {
  const k = `${l.house}|${l.label}`;
  assert.ok(!seen.has(k), `duplicate line: ${k}`);
  seen.add(k);
 }
});

test("unknown text resolves to nothing rather than guessing", () => {
 assert.equal(resolveBrandLine("vintage plaid midi dress"), null);
 assert.equal(resolveBrandLine(""), null);
 assert.equal(resolveBrandLine(null), null);
});
