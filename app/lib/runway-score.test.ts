import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreRunwayCandidates, houseKey, formatRunway, parseRunway, type RunwayCandidate } from "./runway-score.ts";

// Naming a show raises the asking price and is publicly falsifiable, so these
// tests are mostly about what the scorer REFUSES to assert.

const look = (house: string, season: string, year: number, similarity: number): RunwayCandidate =>
 ({ house, season, year, lookNo: null, sourceUrl: null, licenseRef: null, similarity });

test("two looks from the same show above the floor is a match", () => {
 const v = scoreRunwayCandidates([
  look("Tom Ford for Gucci", "S/S", 2004, 0.79),
  look("Tom Ford for Gucci", "S/S", 2004, 0.76),
 ], "Tom Ford for Gucci");
 assert.equal(v.reason, "matched");
 assert.equal(v.runway, "Tom Ford for Gucci S/S 2004");
 assert.equal(v.supporting, 2);
});

test("a single strong look can carry it alone", () => {
 const v = scoreRunwayCandidates([look("Cavalli", "S/S", 2003, 0.86)], "Cavalli");
 assert.equal(v.reason, "matched");
 assert.equal(v.runway, "Cavalli S/S 2003");
});

test("a single mediocre look is not enough", () => {
 const v = scoreRunwayCandidates([look("Cavalli", "S/S", 2003, 0.76)], "Cavalli");
 assert.equal(v.reason, "no-consensus");
 assert.equal(v.runway, null);
});

test("everything below the similarity floor returns nothing", () => {
 const v = scoreRunwayCandidates([look("Prada", "F/W", 1998, 0.61), look("Prada", "F/W", 1998, 0.58)], "Prada");
 assert.equal(v.reason, "below-threshold");
 assert.equal(v.runway, null);
});

test("two plausible seasons cancel out rather than one winning by a hair", () => {
 const v = scoreRunwayCandidates([
  look("Prada", "F/W", 1998, 0.80),
  look("Prada", "S/S", 1999, 0.79),
 ], "Prada");
 assert.equal(v.reason, "no-consensus");
 assert.equal(v.runway, null);
});

test("a clear margin over the runner-up does win", () => {
 const v = scoreRunwayCandidates([
  look("Prada", "F/W", 1998, 0.88),
  look("Prada", "S/S", 1999, 0.75),
 ], "Prada");
 assert.equal(v.reason, "matched");
 assert.equal(v.runway, "Prada F/W 1998");
});

test("a lookalike from another house is never provenance", () => {
 const v = scoreRunwayCandidates([
  look("Dolce & Gabbana", "S/S", 2003, 0.90),
  look("Dolce & Gabbana", "S/S", 2003, 0.88),
 ], "Roberto Cavalli");
 assert.equal(v.reason, "brand-mismatch");
 assert.equal(v.runway, null);
});

test("house naming variants still match each other", () => {
 const v = scoreRunwayCandidates([look("Tom Ford for Gucci", "S/S", 2004, 0.86)], "Gucci");
 assert.equal(v.reason, "matched");
 assert.equal(houseKey("Tom Ford for Gucci").includes(houseKey("Gucci")), true);
});

test("an empty index is reported as such, not as a rejection", () => {
 assert.equal(scoreRunwayCandidates([], "Gucci").reason, "no-index");
});

test("with no brand known, the closest corroborated season still wins", () => {
 const v = scoreRunwayCandidates([
  look("Mugler", "F/W", 1995, 0.81),
  look("Mugler", "F/W", 1995, 0.79),
 ], null);
 assert.equal(v.runway, "Mugler F/W 1995");
});

test("formatRunway matches the format the listing copy expects", () => {
 assert.equal(formatRunway({ house: "Tom Ford for Gucci", season: "S/S", year: 2004 }), "Tom Ford for Gucci S/S 2004");
});

// parseRunway gates what gets WRITTEN INTO the index, so it errs the same way the scorer does:
// anything it can't read as a documented season comes back null rather than a guess.

test("parseRunway round-trips formatRunway", () => {
 const look = { house: "Tom Ford for Gucci", season: "S/S", year: 2004 };
 assert.deepEqual(parseRunway(formatRunway(look)), look);
});

test("parseRunway keeps multi-word houses intact", () => {
 assert.deepEqual(parseRunway("Roberto Cavalli S/S 2001"), { house: "Roberto Cavalli", season: "S/S", year: 2001 });
 assert.deepEqual(parseRunway("Christian Dior by John Galliano F/W 2004"), { house: "Christian Dior by John Galliano", season: "F/W", year: 2004 });
});

test("parseRunway normalises season spelling", () => {
 assert.equal(parseRunway("Prada f/w 1999")?.season, "F/W");
 assert.equal(parseRunway("Blumarine prefall 2003")?.season, "Pre-Fall");
 assert.equal(parseRunway("Escada Pre-Fall 2003")?.season, "Pre-Fall");
});

test("parseRunway refuses anything that isn't a documented season", () => {
 for (const bad of ["", "early 2000s Cavalli", "Gucci 1999", "S/S 2004", "Gucci S/S 99", "Gucci Spring 2004"]) {
  assert.equal(parseRunway(bad), null, `should refuse: ${bad}`);
 }
});
