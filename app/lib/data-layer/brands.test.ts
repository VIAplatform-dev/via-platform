import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBrand, brandSlug, aliasMatches, type BrandRef } from "./brands.ts";
import { brands as BRAND_DEFS, WHOLE_WORD_ALIASES } from "../brandData.ts";

// Build the reference straight from the real brand data (import-free file, so it
// loads under raw node). This exercises the SHIPPING alias map.
const REF: BrandRef[] = BRAND_DEFS.map((b) => ({ slug: b.slug, label: b.label, aliases: b.keywords }));
// Helper bound to the shipping whole-word set, mirroring the ETL call.
const resolve = (t: string) => resolveBrand(t, REF, WHOLE_WORD_ALIASES);

// A small hand-built ref for precise boundary / priority assertions.
const MINI: BrandRef[] = [
 { slug: "saint-laurent", label: "Saint Laurent", aliases: ["saint laurent", "ysl", "yves saint laurent"] },
 { slug: "louis-vuitton", label: "Louis Vuitton", aliases: ["louis vuitton", "lv"] },
 { slug: "dior", label: "Dior", aliases: ["dior", "christian dior", "cd"] },
];

// ── alias → canonical ────────────────────────────────────────────────────────
test("resolveBrand: synonyms collapse to the canonical label", () => {
 assert.equal(resolveBrand("Vintage YSL Tribute heels", REF), "Saint Laurent");
 assert.equal(resolveBrand("Yves Saint Laurent silk blouse", REF), "Saint Laurent");
 assert.equal(resolveBrand("Saint Laurent Kate bag", REF), "Saint Laurent");
 assert.equal(resolveBrand("LV Speedy 30 monogram", REF), "Louis Vuitton");
 assert.equal(resolveBrand("Christian Dior saddle bag", REF), "Dior");
});

test("resolveBrand: case-insensitive", () => {
 assert.equal(resolveBrand("vintage ysl bag", MINI), "Saint Laurent");
 assert.equal(resolveBrand("GUCCI loafers", REF), "Gucci");
});

// ── never guess → null ───────────────────────────────────────────────────────
test("resolveBrand: unknown title resolves to null (never guesses)", () => {
 assert.equal(resolveBrand("Beautiful vintage silk slip dress", REF), null);
 assert.equal(resolveBrand("Hand-knit wool cardigan, size M", REF), null);
 assert.equal(resolveBrand("", REF), null);
 assert.equal(resolveBrand(null, REF), null);
 assert.equal(resolveBrand(undefined, REF), null);
});

// ── short-alias word boundaries (no false positives inside words) ────────────
test("resolveBrand: short aliases need word boundaries", () => {
 // "lv" must NOT match inside "solving" / "lvmh", "cd" not inside "scdream".
 assert.equal(resolveBrand("Problem-solving toolkit", MINI), null);
 assert.equal(resolveBrand("LVMH holding company", MINI), null);
 assert.equal(resolveBrand("record cd case", MINI), "Dior"); // standalone "cd" → Dior (alias)
 assert.equal(resolveBrand("scoreboard", MINI), null);
 // but standalone short alias still resolves
 assert.equal(resolveBrand("Authentic LV pochette", MINI), "Louis Vuitton");
});

// ── priority: first matching brand in ref order wins ─────────────────────────
test("resolveBrand: first matching brand (ref order) wins", () => {
 const ref: BrandRef[] = [
 { slug: "a", label: "Brand A", aliases: ["alpha"] },
 { slug: "b", label: "Brand B", aliases: ["beta"] },
 ];
 assert.equal(resolveBrand("alpha beta combo", ref), "Brand A");
 assert.equal(resolveBrand("beta only", ref), "Brand B");
});

// ── brandSlug helper ─────────────────────────────────────────────────────────
test("brandSlug: maps a resolved label back to its canonical slug", () => {
 assert.equal(brandSlug("Saint Laurent", REF), "saint-laurent");
 assert.equal(brandSlug("Louis Vuitton", REF), "louis-vuitton");
 assert.equal(brandSlug(null, REF), null);
 assert.equal(brandSlug("Not A Brand", REF), null);
});

// ── substring-of-common-word false positives (the bug) ──────────────────────
test("resolveBrand: whole-word aliases don't match inside common words", () => {
 // etro → retro/metro, boss → embossed, coach → stagecoach/coaching,
 // pucci → cappuccino, marni → marnier, "the row" → "the rowing".
 assert.equal(resolve("Retro floral dress"), null);
 assert.equal(resolve("Metro chic trench coat"), null);
 assert.equal(resolve("Embossed leather tote"), null);
 assert.equal(resolve("Vintage stagecoach western boots"), null);
 assert.equal(resolve("Life coaching tee"), null);
 assert.equal(resolve("Cappuccino brown suede bag"), null);
 assert.equal(resolve("Grand Marnier glass barware"), null);
 assert.equal(resolve("The rowing club crewneck"), null);
});

test("resolveBrand: whole-word aliases STILL match as standalone words", () => {
 assert.equal(resolve("Etro paisley silk scarf"), "Etro");
 assert.equal(resolve("Coach leather shoulder bag"), "Coach");
 assert.equal(resolve("Hugo Boss wool blazer"), "Hugo Boss");
 assert.equal(resolve("Boss pinstripe suit"), "Hugo Boss"); // bare alias, whole word
 assert.equal(resolve("Emilio Pucci print blouse"), "Emilio Pucci");
 assert.equal(resolve("Marni fussbett sandals"), "Marni");
 assert.equal(resolve("The Row Margaux bag"), "The Row");
});

test("resolveBrand: normal aliases still match plurals & possessives", () => {
 assert.equal(resolve("Guccis bag"), "Gucci");
 assert.equal(resolve("Gucci's vintage loafers"), "Gucci");
 assert.equal(resolve("Gucci-style monogram belt"), "Gucci");
 assert.equal(resolve("Pradas nylon pouch"), "Prada");
});

// ── aliasMatches unit (shared by all matchers) ───────────────────────────────
test("aliasMatches. Whole-word vs substring", () => {
 assert.equal(aliasMatches("retro dress", "etro", true), false);
 assert.equal(aliasMatches("etro scarf", "etro", true), true);
 assert.equal(aliasMatches("guccis bag", "gucci", false), true); // substring keeps plurals
 assert.equal(aliasMatches("black bag", "ck", false), false); // ≤3 always whole-word
 assert.equal(aliasMatches("ck one tee", "ck", false), true);
});

// ── every seeded alias resolves to its own brand (self-consistency) ──────────
test("resolveBrand: every shipped alias resolves to its canonical brand", () => {
 for (const b of REF) {
 for (const alias of b.aliases) {
  const got = resolveBrand(`prefix ${alias} suffix`, REF);
  assert.ok(got !== null, `alias "${alias}" (${b.label}) resolved to null`);
 }
 }
});
