import { test } from "node:test";
import assert from "node:assert/strict";
import { FIELDS, PARCEL_KEYS, WEB_PATCH_FIELDS, MAX_PHOTOS, type FieldKey } from "./listing-fields.ts";

test("the phone can edit every listing field the web can", () => {
  // The regression this exists for: the phone carried eight of these and the web seventeen, so a
  // description written on a laptop was invisible and uncorrectable at the counter.
  //
  // The box dimensions are the one exception, and deliberately so: like the web, the phone asks
  // "Ships in" and writes L/W/H from the chosen preset (lib/seller/packaging.ts). They are still
  // SENT — they are simply not typed, because nobody measures a mailer.
  const CHOSEN_NOT_TYPED = new Set(["lengthIn", "widthIn", "heightIn"]);
  const onPhone = new Set<string>(FIELDS.map((f) => f.key));
  const missing = WEB_PATCH_FIELDS.filter((k) => !onPhone.has(k) && !CHOSEN_NOT_TYPED.has(k));
  assert.deepEqual(missing, [], `the web accepts these and the phone has no box for them: ${missing.join(", ")}`);

  // ...and they must still be in the patch list, or choosing a box would change nothing.
  for (const k of CHOSEN_NOT_TYPED) {
    assert.ok(WEB_PATCH_FIELDS.includes(k), `${k} must still be sent to the route`);
  }
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

test("every parcel key is stored as an integer, typed or chosen", () => {
  // PARCEL_KEYS is what the save routine coerces to whole numbers. Weight is typed, so it must
  // also be a numeric FIELD; the three dimensions arrive from the packaging preset and have no
  // box at all, but still go through the same integer coercion on the way out.
  assert.deepEqual(PARCEL_KEYS, ["weightOz", "lengthIn", "widthIn", "heightIn"]);
  const weight = FIELDS.find((x) => x.key === ("weightOz" as FieldKey));
  assert.ok(weight, "weightOz must still be a typed field — the box cannot supply it");
  assert.equal(weight!.numeric, true);
  for (const k of ["lengthIn", "widthIn", "heightIn"]) {
    assert.ok(!FIELDS.some((f) => f.key === (k as FieldKey)), `${k} is chosen, not typed`);
  }
});

test("money and measurements are numeric; the words are not", () => {
  const numeric = FIELDS.filter((f) => f.numeric).map((f) => f.key).sort();
  assert.deepEqual(numeric, ["cost", "price", "weightOz"]);
});

test("description is the only multiline field", () => {
  assert.deepEqual(FIELDS.filter((f) => f.multiline).map((f) => f.key), ["description"]);
});

test("the photo cap is the LOWER of the two write paths", () => {
  // The items PATCH keeps 20; intake/publish keeps MAX_ITEM_IMAGES = 15. Picking the higher number
  // would let her choose 20 photos and silently store 15 of them on the listing flow.
  assert.equal(MAX_PHOTOS, 15);
});
