import { test } from "node:test";
import assert from "node:assert";
import { liveCrossListPlatforms, crossListNote, crossListFootnote, type CrossListPlatform } from "./cross-listing.ts";

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
