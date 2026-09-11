import { test } from "node:test";
import assert from "node:assert/strict";
import { FIELDS, PARCEL_KEYS, WEB_PATCH_FIELDS, MAX_PHOTOS, type FieldKey } from "./listing-fields.ts";

test("the phone can edit every listing field the web can", () => {
  // The regression this exists for: the phone carried eight of these and the web seventeen, so a
  // description written on a laptop was invisible and uncorrectable at the counter.
  const onPhone = new Set<string>(FIELDS.map((f) => f.key));
  const missing = WEB_PATCH_FIELDS.filter((k) => !onPhone.has(k));
  assert.deepEqual(missing, [], `the web accepts these and the phone has no box for them: ${missing.join(", ")}`);
});

test("the phone doesn't offer a field the route would ignore", () => {
  // The other direction: a box that silently does nothing is worse than no box.
  const accepted = new Set(WEB_PATCH_FIELDS);
  const orphans = FIELDS.map((f) => f.key).filter((k) => !accepted.has(k));
  assert.deepEqual(orphans, [], `no route takes these: ${orphans.join(", ")}`);
});

test("no field is listed twice", () => {
  const keys = FIELDS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every parcel key is a real field, and numeric", () => {
  for (const k of PARCEL_KEYS) {
    const f = FIELDS.find((x) => x.key === (k as FieldKey));
    assert.ok(f, `${k} is in PARCEL_KEYS but not in FIELDS`);
    assert.equal(f!.numeric, true, `${k} must be numeric — the route stores it as an integer`);
  }
});

test("money and measurements are numeric; the words are not", () => {
  const numeric = FIELDS.filter((f) => f.numeric).map((f) => f.key).sort();
  assert.deepEqual(numeric, ["cost", "heightIn", "lengthIn", "price", "weightOz", "widthIn"]);
});

test("description is the only multiline field", () => {
  assert.deepEqual(FIELDS.filter((f) => f.multiline).map((f) => f.key), ["description"]);
});

test("the photo cap is the LOWER of the two write paths", () => {
  // The items PATCH keeps 20; intake/publish keeps MAX_ITEM_IMAGES = 15. Picking the higher number
  // would let her choose 20 photos and silently store 15 of them on the listing flow.
  assert.equal(MAX_PHOTOS, 15);
});
