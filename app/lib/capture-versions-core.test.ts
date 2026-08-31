import { test } from "node:test";
import assert from "node:assert/strict";
import { versionsToDrop, worthVersioning, describeReason, KEEP_VERSIONS } from "./capture-versions-core.ts";

const at = (n: number) => new Date(2026, 0, n).toISOString();

test("keeps everything while under the cap", () => {
 const rows = [
  { id: "a", reason: "crawl" as const, createdAt: at(1) },
  { id: "b", reason: "rewrite" as const, createdAt: at(2) },
 ];
 assert.deepEqual(versionsToDrop(rows), []);
});

test("drops the oldest once over the cap", () => {
 const rows = [
  { id: "a", reason: "rewrite" as const, createdAt: at(1) },
  { id: "b", reason: "rewrite" as const, createdAt: at(2) },
  { id: "c", reason: "rewrite" as const, createdAt: at(3) },
  { id: "d", reason: "rewrite" as const, createdAt: at(4) },
 ];
 assert.deepEqual(versionsToDrop(rows), ["a"]);
});

test("the most recent crawl survives even when it falls outside the cap", () => {
 // The whole point. The rehosting pass touches every page on every repair, so three mechanical
 // rewrites would otherwise evict the actual capture of her site.
 const rows = [
  { id: "capture", reason: "crawl" as const, createdAt: at(1) },
  { id: "r1", reason: "rewrite" as const, createdAt: at(2) },
  { id: "r2", reason: "rewrite" as const, createdAt: at(3) },
  { id: "r3", reason: "rewrite" as const, createdAt: at(4) },
 ];
 assert.deepEqual(versionsToDrop(rows), []);
});

test("an older crawl is still dropped once a newer crawl exists", () => {
 // Only the MOST RECENT crawl is protected — otherwise crawls accumulate for ever.
 const rows = [
  { id: "old-crawl", reason: "crawl" as const, createdAt: at(1) },
  { id: "new-crawl", reason: "crawl" as const, createdAt: at(2) },
  { id: "r1", reason: "rewrite" as const, createdAt: at(3) },
  { id: "r2", reason: "rewrite" as const, createdAt: at(4) },
  { id: "r3", reason: "rewrite" as const, createdAt: at(5) },
 ];
 assert.deepEqual(versionsToDrop(rows), ["old-crawl"]);
});

test("order of the input does not matter", () => {
 const rows = [
  { id: "d", reason: "rewrite" as const, createdAt: at(4) },
  { id: "a", reason: "rewrite" as const, createdAt: at(1) },
  { id: "c", reason: "rewrite" as const, createdAt: at(3) },
  { id: "b", reason: "rewrite" as const, createdAt: at(2) },
 ];
 assert.deepEqual(versionsToDrop(rows), ["a"]);
});

test("Date objects and ISO strings sort the same way", () => {
 const rows = [
  { id: "a", reason: "rewrite" as const, createdAt: new Date(2026, 0, 1) },
  { id: "b", reason: "rewrite" as const, createdAt: at(2) },
  { id: "c", reason: "rewrite" as const, createdAt: new Date(2026, 0, 3) },
  { id: "d", reason: "rewrite" as const, createdAt: at(4) },
 ];
 assert.deepEqual(versionsToDrop(rows), ["a"]);
});

test("a caller asking to keep nothing is refused, not obeyed", () => {
 // Deleting a seller's entire history because a config value read as 0 is not a thing this does.
 const rows = [{ id: "a", reason: "crawl" as const, createdAt: at(1) }];
 assert.deepEqual(versionsToDrop(rows, 0), []);
});

test("identical content is not worth a version", () => {
 // The rehosting pass frequently rewrites a page to exactly what it already was.
 assert.equal(worthVersioning("h1", "h1"), false);
 assert.equal(worthVersioning("h1", "h2"), true);
 assert.equal(worthVersioning(null, "h1"), true);
 assert.equal(worthVersioning("h1", ""), false);
});

test("every reason has words a seller would recognise", () => {
 assert.equal(describeReason("crawl"), "Imported from the store");
 assert.equal(describeReason("edit"), "Edited in the builder");
 assert.equal(describeReason("rewrite"), "Images re-hosted");
});

test("the cap is three", () => {
 assert.equal(KEEP_VERSIONS, 3);
});

test("versions saved in the same second are still ordered by which came last", () => {
 // Postgres handed back whole-second timestamps in the trial run, so three rewrites of one page all
 // carried the SAME created_at. Sorting on time alone then picks an arbitrary winner: the pruner can
 // evict the newest version and the seller's undo can restore the wrong one. The id is a BIGSERIAL,
 // so it breaks the tie in the order the rows were actually written.
 const same = at(5);
 const rows = [
  { id: "10", reason: "rewrite" as const, createdAt: same },
  { id: "11", reason: "rewrite" as const, createdAt: same },
  { id: "12", reason: "rewrite" as const, createdAt: same },
  { id: "13", reason: "rewrite" as const, createdAt: same },
 ];
 assert.deepEqual(versionsToDrop(rows), ["10"]);
});

test("a tie between a crawl and a rewrite still protects the crawl", () => {
 const same = at(5);
 const rows = [
  { id: "1", reason: "crawl" as const, createdAt: same },
  { id: "2", reason: "rewrite" as const, createdAt: same },
  { id: "3", reason: "rewrite" as const, createdAt: same },
  { id: "4", reason: "rewrite" as const, createdAt: same },
 ];
 assert.deepEqual(versionsToDrop(rows), []);
});
