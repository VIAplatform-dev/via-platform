import { test } from "node:test";
import assert from "node:assert";
import { liveCrossListPlatforms, crossListNote, crossListFootnote, type CrossListPlatform, failedPieces, failureAdvice, needsDesktop } from "./cross-listing.ts";

// What the route actually sends today.
const ALL: CrossListPlatform[] = [
  { key: "ebay", name: "eBay", hasApi: true, mode: "api" },
  { key: "depop", name: "Depop", hasApi: false, mode: "extension" },
  { key: "vestiaire", name: "Vestiaire Collective", hasApi: false, mode: "extension" },
  { key: "poshmark", name: "Poshmark", hasApi: false, mode: "soon" },
  { key: "etsy", name: "Etsy", hasApi: true, mode: "soon" },
  { key: "vinted", name: "Vinted", hasApi: false, mode: "soon" },
  { key: "mercari", name: "Mercari", hasApi: false, mode: "soon" },
  { key: "grailed", name: "Grailed", hasApi: false, mode: "soon" },
  { key: "instagram", name: "Instagram", hasApi: false, mode: "soon" },
  { key: "facebook", name: "Facebook Marketplace", hasApi: false, mode: "soon" },
];

test("only the three that are wired up are offered", () => {
  assert.deepEqual(
    liveCrossListPlatforms(ALL).map((p) => p.key),
    ["ebay", "depop", "vestiaire"],
  );
});

test("nothing that cannot post is offered", () => {
  // The whole bug: ten chips, seven of which quietly discarded the choice.
  const keys = liveCrossListPlatforms(ALL).map((p) => p.key);
  for (const dead of ["poshmark", "etsy", "vinted", "mercari", "grailed", "instagram", "facebook"]) {
    assert.ok(!keys.includes(dead), `${dead} should not be offered`);
  }
});

test("the automatic one comes first", () => {
  assert.equal(liveCrossListPlatforms(ALL)[0].key, "ebay");
});

test("each chip says what it will actually do", () => {
  assert.equal(crossListNote({ key: "ebay", name: "eBay", mode: "api" }), "Posts automatically");
  assert.equal(crossListNote({ key: "depop", name: "Depop", mode: "extension" }), "Finish in your browser");
  assert.equal(crossListNote({ key: "vestiaire", name: "Vestiaire Collective", mode: "extension" }), "Finish in your browser");
});

test("the footnote names both halves and does not claim eBay needs a computer", () => {
  const note = crossListFootnote(liveCrossListPlatforms(ALL));
  assert.match(note, /eBay posts on their own|eBay posts/);
  assert.match(note, /Depop and Vestiaire Collective/);
  assert.match(note, /browser/);
  // The old copy said ALL posting runs from the computer, which stopped being true for eBay.
  assert.ok(!/^The actual posting runs from the computer/.test(note));
});

test("the footnote drops a half that isn't there", () => {
  const onlyAuto = crossListFootnote([{ key: "ebay", name: "eBay", mode: "api" }]);
  assert.ok(!onlyAuto.includes("browser"), onlyAuto);

  const onlyManual = crossListFootnote([{ key: "depop", name: "Depop", mode: "extension" }]);
  assert.ok(!onlyManual.includes("on their own"), onlyManual);
  assert.match(onlyManual, /Depop has no listing API/);
});

test("an unknown or missing mode is not offered", () => {
  // A channel the app doesn't understand is not a channel to gamble a listing on.
  assert.deepEqual(liveCrossListPlatforms([{ key: "x", name: "X" }]), []);
  assert.deepEqual(liveCrossListPlatforms([]), []);
});

/* ── the pieces behind "3 pieces failed to post" ───────────────────────── */

// That row used to have no in-app screen and fell through to a browser sheet pointed at
// /admin/cross-listing, which is the one thing the seller app must not do.

const PLATS: CrossListPlatform[] = [
  { key: "ebay", name: "eBay", mode: "api" },
  { key: "depop", name: "Depop", mode: "extension" },
  { key: "vestiaire", name: "Vestiaire Collective", mode: "extension" },
];

const row = (itemId: string, listings: Record<string, string>, title: string | null = itemId) =>
  ({ itemId, title, images: [`${itemId}.jpg`], listings });

test("only pieces with an errored platform, and only the platforms that errored", () => {
  const out = failedPieces([
    row("a", { ebay: "listed", depop: "error" }),
    row("b", { ebay: "listed" }),
    row("c", { ebay: "error", vestiaire: "error" }),
    row("d", { depop: "queued" }),
  ], PLATS);
  assert.deepEqual(out.map((p) => p.itemId), ["a", "c"]);
  assert.deepEqual(out[0].platforms, ["depop"]);
  assert.deepEqual(out[1].platforms, ["ebay", "vestiaire"]);
  assert.equal(out[0].image, "a.jpg");
});

test("a piece with no title is still nameable, and a dead platform is not named at all", () => {
  const out = failedPieces([row("a", { grailed: "error", depop: "error" }, "  ")], PLATS);
  assert.equal(out[0].title, "Untitled piece");
  // "grailed" is not on offer any more; naming it in "go and fix this" helps nobody.
  assert.deepEqual(out[0].platforms, ["depop"]);
});

test("a board with nothing wrong is empty, not absent", () => {
  assert.deepEqual(failedPieces([], PLATS), []);
  assert.deepEqual(failedPieces([row("a", {})], PLATS), []);
  assert.deepEqual(failedPieces([{ itemId: "a", title: "a" }], PLATS), []);
});

test("the advice separates what she can retry from what needs a computer", () => {
  assert.equal(failureAdvice(["ebay"], PLATS), "eBay can be retried from here.");
  assert.equal(
    failureAdvice(["depop"], PLATS),
    "Depop has no listing API, so finish it on your computer with the VYA extension.",
  );
  assert.equal(
    failureAdvice(["depop", "vestiaire"], PLATS),
    "Depop and Vestiaire Collective have no listing API, so finish them on your computer with the VYA extension.",
  );
  // Both kinds at once: the retryable half is still offered rather than buried.
  assert.equal(
    failureAdvice(["ebay", "depop"], PLATS),
    "eBay can be retried from here. Depop has no listing API, so finish it on your computer with the VYA extension.",
  );
});

test("whether the phone can do anything at all about it", () => {
  assert.equal(needsDesktop(["depop", "vestiaire"], PLATS), true);
  assert.equal(needsDesktop(["ebay"], PLATS), false);
  assert.equal(needsDesktop(["ebay", "depop"], PLATS), false);
});
