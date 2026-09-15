import test from "node:test";
import assert from "node:assert/strict";
import { rankDemand, demandLabel, normaliseSuggestion, matchKnownPlatform, rankSuggestions } from "./marketplace-votes.ts";

const SOON = [
 { key: "poshmark", name: "Poshmark" },
 { key: "etsy", name: "Etsy" },
 { key: "vinted", name: "Vinted" },
 { key: "grailed", name: "Grailed" },
];

test("the most-wanted channel comes first", () => {
 const out = rankDemand(SOON, { poshmark: 9, etsy: 2, vinted: 12 });
 assert.deepEqual(out.map((d) => d.key), ["vinted", "poshmark", "etsy", "grailed"]);
 assert.equal(out[0].votes, 12);
 assert.equal(out[3].votes, 0, "a channel nobody asked for still appears, at the bottom");
});

test("a tie breaks alphabetically, not by who was added to the registry first", () => {
 const out = rankDemand(SOON, { poshmark: 4, etsy: 4, vinted: 4, grailed: 4 });
 assert.deepEqual(out.map((d) => d.name), ["Etsy", "Grailed", "Poshmark", "Vinted"]);
});

test("her own votes come back marked, so the button knows what it is", () => {
 const out = rankDemand(SOON, { poshmark: 3 }, ["poshmark", "etsy"]);
 assert.equal(out.find((d) => d.key === "poshmark")!.wanted, true);
 assert.equal(out.find((d) => d.key === "etsy")!.wanted, true);
 assert.equal(out.find((d) => d.key === "vinted")!.wanted, false);
});

test("a junk count can't invent demand", () => {
 const out = rankDemand(SOON, { poshmark: -5, etsy: 1.7, vinted: NaN } as never);
 assert.equal(out.find((d) => d.key === "poshmark")!.votes, 0);
 assert.equal(out.find((d) => d.key === "etsy")!.votes, 1);
 assert.equal(out.find((d) => d.key === "vinted")!.votes, 0);
});

test("nobody is told a channel has zero votes", () => {
 // "0 votes" under every row on day one reads like a dead feature. It's an invitation instead.
 assert.equal(demandLabel(0, false), "Want this next?");
 assert.equal(demandLabel(5, false), "5 shops want this");
 assert.equal(demandLabel(1, false), "1 shop wants this");
});

test("her own vote is never reported back to her as a crowd", () => {
 // A count of one that is hers is not "1 shop wants this". It's her.
 assert.equal(demandLabel(1, true), "You want this");
 assert.equal(demandLabel(2, true), "You and 1 other want this");
 assert.equal(demandLabel(6, true), "You and 5 others want this");
});

test("a typed suggestion is tidied, and junk is refused", () => {
 assert.equal(normaliseSuggestion("  Kidsuper   Market "), "Kidsuper Market");
 assert.equal(normaliseSuggestion("https://therealreal.com/"), "therealreal.com");
 assert.equal(normaliseSuggestion("x"), null, "one character is not a marketplace");
 assert.equal(normaliseSuggestion("a".repeat(61)), null, "someone pasting an essay into the box");
 assert.equal(normaliseSuggestion("<script>alert(1)</script>"), null);
 assert.equal(normaliseSuggestion(42), null);
 assert.equal(normaliseSuggestion(""), null);
});

test("typing the name of a channel we already list counts as a vote for it", () => {
 // Otherwise the same demand is split across two tallies and the real one looks smaller.
 assert.equal(matchKnownPlatform("poshmark", SOON), "poshmark");
 assert.equal(matchKnownPlatform("Poshmark ", SOON), "poshmark");
 assert.equal(matchKnownPlatform("poshmark.com", SOON), "poshmark");
 assert.equal(matchKnownPlatform("Vinted", SOON), "vinted");
 assert.equal(matchKnownPlatform("The RealReal", SOON), null, "a genuine write-in stays a write-in");
});

test("a multi-word channel name matches however it's typed", () => {
 const withVestiaire = [...SOON, { key: "vestiaire", name: "Vestiaire Collective" }];
 for (const typed of ["Vestiaire Collective", "vestiaire", "vestiairecollective.com", "VESTIAIRE"]) {
  assert.equal(matchKnownPlatform(typed, withVestiaire), "vestiaire", `"${typed}" should match`);
 }
});

test("write-ins are grouped however they were spelled", () => {
 const out = rankSuggestions([
  { suggestion: "The RealReal" }, { suggestion: "therealreal" }, { suggestion: "THE REALREAL" },
  { suggestion: "Rebag" }, { suggestion: "  " },
 ]);
 // Case and spacing group together; the first spelling seen is the one shown.
 assert.equal(out[0].name, "The RealReal");
 assert.equal(out[0].count, 2, "'therealreal' is spelled differently, so it is its own row");
 assert.equal(out.some((s) => s.name === "Rebag" && s.count === 1), true);
 assert.equal(out.some((s) => !s.name.trim()), false, "blanks never reach the tally");
});
