import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKAGING, packagingById, packedWeightOz, girthOf, suggestPackaging } from "./packaging.ts";
import { assignTier, SHIPPING_TIERS } from "./shipping-tiers.ts";

const byId = (id: string) => packagingById(id)!;
const tierOf = (id: string, pieceOz: number) => {
 const p = byId(id);
 return assignTier({ weightOz: packedWeightOz(pieceOz, p), lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn }).id;
};

test("every option is a real package with a weight of its own", () => {
 for (const p of PACKAGING) {
  assert.ok(p.lengthIn > 0 && p.widthIn > 0 && p.heightIn > 0, p.id);
  assert.ok(p.tareOz > 0, `${p.id} weighs something empty`);
  assert.ok(p.label && p.hint, p.id);
 }
});

test("a big sweatshirt in a poly mailer is not charged as Small", () => {
 // The case that started this: light enough for the Small tier on weight, far too big for it on
 // girth. Undercharging here means the store eats the difference on every heavy-but-light piece.
 assert.equal(tierOf("mailer-l", 26), "medium");
});

test("a tee in a small mailer really is Small", () => {
 assert.equal(tierOf("mailer-s", 6), "small");
});

test("a coat in a large box is charged as Large, on size alone", () => {
 // 20+16+10 = 46in girth, past Medium's 40 — so even a light coat can't quote Medium.
 assert.equal(tierOf("box-l", 30), "large");
 assert.equal(tierOf("box-xl", 20), "large");
});

test("a heavy piece is Large however small the box", () => {
 assert.equal(tierOf("box-s", 60), "large"); // 65oz packed, past Medium's 48
});

test("packed weight includes the packaging, because the scale does", () => {
 assert.equal(packedWeightOz(30, byId("box-l")), 42);
 assert.equal(packedWeightOz(0, byId("box-l")), 0);   // nothing known yet — don't invent one
 assert.equal(packedWeightOz(null, byId("box-l")), 0);
});

test("the list reads as a scale — each option is bigger than the last", () => {
 const vol = (p: typeof PACKAGING[number]) => p.lengthIn * p.widthIn * p.heightIn;
 for (let i = 1; i < PACKAGING.length; i++) {
  assert.ok(vol(PACKAGING[i]) > vol(PACKAGING[i - 1]), `${PACKAGING[i].id} > ${PACKAGING[i - 1].id}`);
 }
});

test("every tier is reachable from some packaging, so the ladder isn't decorative", () => {
 const reached = new Set(PACKAGING.map((p) => tierOf(p.id, 10)));
 for (const t of SHIPPING_TIERS) assert.ok(reached.has(t.id) || t.id === "large", `${t.id} unreachable`);
});

test("suggested packaging never undercharges the weight it was suggested from", () => {
 // If the AI says 26oz and we preselect a package, that package's tier must cover 26oz — otherwise
 // the default itself is the leak.
 for (const oz of [4, 10, 20, 30, 40, 60, 90, 150]) {
  const p = byId(suggestPackaging(oz));
  const t = assignTier({ weightOz: packedWeightOz(oz, p), lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn });
  assert.ok(packedWeightOz(oz, p) <= t.maxWeightOz, `${oz}oz suggested ${p.id}, tier ${t.id} caps at ${t.maxWeightOz}`);
  assert.ok(girthOf(p) <= t.maxGirthIn, `${oz}oz suggested ${p.id}, girth ${girthOf(p)} over ${t.maxGirthIn}`);
 }
});

test("an unknown id is null, not a wrong box", () => {
 assert.equal(packagingById("envelope"), null);
 assert.equal(packagingById(null), null);
});
