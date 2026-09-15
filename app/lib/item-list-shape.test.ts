import { test } from "node:test";
import assert from "node:assert/strict";
import { toListItem } from "./item-list-shape.ts";

const row = {
 id: "i1", title: "Gucci by Tom Ford velvet jacket", priceCents: 145000, costCents: 40000,
 currency: "USD", images: ["a.jpg", "b.jpg", "c.jpg"], category: "outerwear", status: "active",
 soldAt: null, createdAt: new Date("2026-08-01T12:00:00Z"),
};

test("a list carries only the first photograph", () => {
 // The list draws images[0] as a row thumbnail or a grid tile. The rest belong to the piece.
 assert.deepEqual(toListItem(row).images, ["a.jpg"]);
 // "No photo" in Needs you asks whether there is one AT ALL, and that answer must survive.
 assert.deepEqual(toListItem({ ...row, images: [] }).images, []);
 assert.deepEqual(toListItem({ ...row, images: null }).images, []);
 assert.deepEqual(toListItem({ ...row, images: "not an array" }).images, []);
 // A blank string is not a photograph.
 assert.deepEqual(toListItem({ ...row, images: ["", "  ", "real.jpg"] }).images, ["real.jpg"]);
});

test("nothing the list does not draw comes with it", () => {
 // The big ones: description was 3.7 MB on the largest store, variants 530 KB, source_url 269 KB.
 const out = toListItem({ ...row, description: "x".repeat(5000), variants: [{ id: 1 }], sourceUrl: "https://…", measurements: "chest 20", sellerId: "s1" } as never);
 assert.deepEqual(Object.keys(out).sort(), [
  "category", "costCents", "createdAt", "currency", "id", "images", "priceCents", "soldAt", "status", "title",
 ]);
});

test("cost comes, because the list is what finds the pieces missing it", () => {
 // "No cost" flags live pieces priced before she knew what she paid. The list applies that filter
 // itself, so the number has to be here. It reaches her phone and nowhere a shopper can see.
 assert.equal(toListItem(row).costCents, 40000);
 assert.equal(toListItem({ ...row, costCents: null }).costCents, null);
 // Zero is a cost she recorded. It is not the same as never having said.
 assert.equal(toListItem({ ...row, costCents: 0 }).costCents, 0);
});

test("dates go over the wire as strings, however they came out of the database", () => {
 assert.equal(toListItem(row).createdAt, "2026-08-01T12:00:00.000Z");
 assert.equal(toListItem({ ...row, createdAt: "2026-08-01T12:00:00Z" }).createdAt, "2026-08-01T12:00:00.000Z");
 assert.equal(toListItem({ ...row, createdAt: null }).createdAt, null);
 // Age is drawn off createdAt; a date that won't parse must not become "Invalid Date" on screen.
 assert.equal(toListItem({ ...row, createdAt: "not a date" }).createdAt, null);
 assert.equal(toListItem({ ...row, soldAt: new Date("2026-09-01T00:00:00Z") }).soldAt, "2026-09-01T00:00:00.000Z");
});

test("a half-filled draft still comes back drawable", () => {
 // A piece created from a photo and nothing else: the list must still render a row for it.
 const draft = toListItem({ ...row, title: null, priceCents: null, currency: null, category: null, status: "draft" });
 assert.equal(draft.title, "");
 assert.equal(draft.priceCents, 0);
 assert.equal(draft.currency, "USD");
 assert.equal(draft.category, null);
 assert.equal(draft.status, "draft");
});
