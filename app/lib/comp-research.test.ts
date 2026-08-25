import { test } from "node:test";
import assert from "node:assert/strict";
import { researchComps, describeResearch } from "./comp-research.ts";
import type { VisualMatch } from "./comps.ts";

// The researcher is the step every pricing path shares. These tests pin the ORDER of its stages
// and its refusal to ever hand back an empty comp list — the two properties that, when they were
// wrong, produced confidently wrong prices rather than errors.

const m = (title: string, over: Partial<VisualMatch> = {}): VisualMatch => ({
 title, priceCents: null, source: "test", thumbnail: `https://x/${encodeURIComponent(title)}.jpg`, ...over,
});

const QUERY_EMB = [1, 0, 0];

test("a visually-confirmed match survives even when its title never names the brand", async () => {
 // The Valentino case: 8 photographs of the same dress, none of whose titles said Valentino.
 // Brand-filtering first threw away every one of them.
 const matches = [m("Pink Polka Dot Swing Dress", { priceCents: 120000 }), m("Valentino scarf", { priceCents: 8000 })];
 const r = await researchComps(matches, {
  queryEmbedding: QUERY_EMB,
  brand: "Valentino",
  linkVerify: false,
  scoreOne: async (url) => (url.includes("Polka") ? 0.95 : 0.2),
 });
 assert.equal(r.verified, 1);
 assert.ok(r.matches.some((x) => x.title === "Pink Polka Dot Swing Dress"), "the same dress must be kept on image evidence alone");
 assert.ok(!r.matches.some((x) => x.title === "Valentino scarf"), "a different item is dropped even though its title names the brand");
});

test("brand text is the fallback only for matches the image check could not score", async () => {
 const matches = [m("Valentino gown", { thumbnail: undefined }), m("unrelated tank", { thumbnail: undefined })];
 const r = await researchComps(matches, { queryEmbedding: QUERY_EMB, brand: "Valentino", linkVerify: false, scoreOne: async () => null });
 assert.equal(r.visualRan, false, "nothing was scoreable");
 assert.deepEqual(r.matches.map((x) => x.title), ["Valentino gown"]);
});

test("never returns an empty comp list — falls back rather than pricing off nothing", async () => {
 const matches = [m("some tank top", { priceCents: 3000 })];
 const r = await researchComps(matches, {
  queryEmbedding: QUERY_EMB, brand: "Moschino", linkVerify: false, scoreOne: async () => 0.1, // everything rejected
 });
 assert.ok(r.matches.length > 0, "an empty set is worse than a rough one");
 assert.equal(r.fellBack, true);
});

test("with no embedding the image check is skipped, not failed", async () => {
 const matches = [m("Moschino koi top", { priceCents: 55000 }), m("koi fish artwork", { priceCents: 3000 })];
 const r = await researchComps(matches, { queryEmbedding: null, brand: "Moschino", linkVerify: false });
 assert.equal(r.visualRan, false);
 assert.deepEqual(r.matches.map((x) => x.title), ["Moschino koi top"], "brand text is all that's left");
});

test("link verification is gated: off means the listing is never opened", async () => {
 let fetched = 0;
 const matches = [m("Moschino koi top", { link: "https://vestiairecollective.com/x" })];
 const r = await researchComps(matches, {
  queryEmbedding: QUERY_EMB, brand: "Moschino", linkVerify: false,
  scoreOne: async () => 0.95,
  fetcher: async () => { fetched++; return null; },
 });
 assert.equal(fetched, 0);
 assert.equal(r.pricesRead, 0);
});

test("the log line names every stage, so a bad price can be diagnosed from the logs alone", () => {
 const line = describeResearch({
  matches: [], visualRan: true, verified: 2, rejected: 5, uncheckedKept: 1,
  pricesRead: 1, pricesRecovered: 3, fellBack: false,
 });
 assert.match(line, /verified=2/);
 assert.match(line, /rejected=5/);
 assert.match(line, /priced-by-search=3/);
});
