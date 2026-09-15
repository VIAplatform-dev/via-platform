import { test } from "node:test";
import assert from "node:assert/strict";
import { coverCandidates, coverFor, itemCountLabel, orderCollections, type Collection, type CollectionItem } from "./collections.ts";

const col = (title: string, itemCount: number, imageUrl: string | null = null): Collection =>
  ({ id: title, title, slug: title.toLowerCase(), itemCount, imageUrl });

test("full collections come first, biggest first; empty ones sink but are never hidden", () => {
  const out = orderCollections([col("Archive", 0), col("Knitwear", 3), col("Denim", 12), col("Bags", 0)]);
  assert.deepEqual(out.map((c) => c.title), ["Denim", "Knitwear", "Archive", "Bags"]);
});

test("a tie breaks on title, so the grid doesn't reshuffle between visits", () => {
  const a = orderCollections([col("Zips", 4), col("Aprons", 4)]).map((c) => c.title);
  const b = orderCollections([col("Aprons", 4), col("Zips", 4)]).map((c) => c.title);
  assert.deepEqual(a, ["Aprons", "Zips"]);
  assert.deepEqual(a, b);
});

test("ordering does not mutate what it was handed", () => {
  const input = [col("B", 1), col("A", 9)];
  orderCollections(input);
  assert.deepEqual(input.map((c) => c.title), ["B", "A"]);
});

/* ── covers ────────────────────────────────────────────────────────────── */

const item = (id: string, image: string | null): CollectionItem =>
  ({ id, title: id, priceCents: 1000, image, status: "active" });

test("a cover she set wins; otherwise the first piece that actually has a photo", () => {
  assert.equal(coverFor({ imageUrl: "chosen.jpg" }, [item("a", "a.jpg")]), "chosen.jpg");
  assert.equal(coverFor({ imageUrl: null }, [item("a", null), item("b", "b.jpg")]), "b.jpg");
});

test("nothing to show is null, not a broken image", () => {
  assert.equal(coverFor({ imageUrl: null }, []), null);
  assert.equal(coverFor({ imageUrl: null }, [item("a", null)]), null);
  assert.equal(coverFor({ imageUrl: null }), null);
});

test("only a piece with a photograph can be offered as the cover", () => {
  assert.deepEqual(coverCandidates([item("a", "a.jpg"), item("b", null), item("c", "c.jpg")]).map((i) => i.id), ["a", "c"]);
});

test("the count line", () => {
  assert.equal(itemCountLabel(0), "Empty");
  assert.equal(itemCountLabel(1), "1 piece");
  assert.equal(itemCountLabel(12), "12 pieces");
  assert.equal(itemCountLabel(-1), "Empty");
});
