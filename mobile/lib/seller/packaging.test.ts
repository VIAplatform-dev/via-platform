import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { PACKAGING, packagingById, packedWeightOz, suggestPackaging, packagingFromDims, packagingSummary, weightForPackaging } from "./packaging.ts";

test("the phone's packaging list is IDENTICAL to the web's", () => {
  // This is the point of the file. The buyer pays a flat tier chosen by the larger of weight and
  // girth, so a dimension that drifts from app/lib/packaging.ts is money the store eats on every
  // parcel — silently, and only on pieces listed from the phone.
  const web = fs.readFileSync(path.join(process.cwd(), "..", "app", "lib", "packaging.ts"), "utf8");
  const rows = [...web.matchAll(
    /\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*hint:\s*"([^"]+)",\s*lengthIn:\s*(\d+),\s*widthIn:\s*(\d+),\s*heightIn:\s*(\d+),\s*tareOz:\s*(\d+)\s*\}/g,
  )].map((m) => ({
    id: m[1], label: m[2], hint: m[3],
    lengthIn: Number(m[4]), widthIn: Number(m[5]), heightIn: Number(m[6]), tareOz: Number(m[7]),
  }));

  assert.ok(rows.length >= 7, `parsed only ${rows.length} options from the web list — has its shape changed?`);
  assert.deepEqual(PACKAGING, rows);
});

test("a piece remembers the box it was already in", () => {
  // There is no `packaging` column; only L/W/H are stored. If opening a piece could not recognise
  // its own box, every edit would quietly reset a chosen large box back to the suggestion.
  for (const p of PACKAGING) {
    assert.equal(packagingFromDims({ lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn }), p.id);
  }
});

test("dimensions matching nothing fall back to the weight", () => {
  // A piece measured by hand on the old four-box form, or never given dimensions at all.
  assert.equal(packagingFromDims({ lengthIn: 7, widthIn: 3, heightIn: 2, weightOz: 4 }), "mailer-s");
  assert.equal(packagingFromDims({ weightOz: 200 }), "box-xl");
  assert.equal(packagingFromDims({}), "box-s");
});

test("packed weight adds the box's own weight", () => {
  const boxL = packagingById("box-l")!;
  assert.equal(packedWeightOz(40, boxL), 52); // 40 + 12 tare
  // No weight means no answer, not "just the box".
  assert.equal(packedWeightOz(0, boxL), 0);
  assert.equal(packedWeightOz(null, boxL), 0);
  assert.equal(packedWeightOz(undefined, null), 0);
});

test("the suggestion climbs with weight and never falls off the end", () => {
  assert.equal(suggestPackaging(4), "mailer-s");
  assert.equal(suggestPackaging(20), "mailer-l");
  assert.equal(suggestPackaging(60), "box-m");
  assert.equal(suggestPackaging(500), "box-xl");
  // Garbage in still picks something postable.
  assert.equal(suggestPackaging(NaN), "box-s");
  assert.equal(suggestPackaging(-1), "box-s");
});

test("the summary says the size, and asks for a weight when one is missing", () => {
  assert.match(packagingSummary("box-l", 40)!, /20×16×10 in · about 52 oz packed/);
  assert.match(packagingSummary("box-l", null)!, /add a weight/);
  assert.equal(packagingSummary("nonsense", 40), null);
});

test("every option is a real, distinct id", () => {
  const ids = PACKAGING.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PACKAGING) {
    assert.ok(p.lengthIn > 0 && p.widthIn > 0 && p.heightIn > 0, p.id);
    assert.ok(p.label.trim() && p.hint.trim(), p.id);
    assert.equal(packagingById(p.id), p);
  }
  assert.equal(packagingById("nope"), null);
  assert.equal(packagingById(null), null);
});

// A box and its weight move together — the same rule the web form follows.
test("every box's weight lands back on that same box", () => {
  for (const b of PACKAGING) {
    assert.equal(suggestPackaging(weightForPackaging(b.id)), b.id, `${b.id} does not round-trip`);
  }
  assert.equal(weightForPackaging("not-a-box"), 44);
  assert.equal(weightForPackaging(null), 44);
});
