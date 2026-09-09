import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, addedFeaturesForTier, featuresForTier, type Feature } from "./plans.ts";

// What each tier ADDS over the one below it — the emphasis on the plan cards, so a seller comparing
// three near-identical lists can see what upgrading actually buys.
//
// plans.ts invites editing ("move features between tiers to shape what each plan is worth"), so these
// assert the RULE rather than today's feature lists: reassigning a feature should keep them green,
// and only breaking the rule should turn them red.

const byOrder = [...TIERS].sort((a, b) => a.order - b.order);

test("the lowest tier adds nothing — there is no tier below it to gain anything over", () => {
 assert.deepEqual(addedFeaturesForTier(byOrder[0].id), []);
});

test("each tier adds exactly what it has and the tier below does not", () => {
 for (let i = 1; i < byOrder.length; i++) {
  const below = new Set<Feature>(featuresForTier(byOrder[i - 1].id));
  const expected = featuresForTier(byOrder[i].id).filter((f) => !below.has(f));
  assert.deepEqual(addedFeaturesForTier(byOrder[i].id), expected, `${byOrder[i].id} adds the wrong set`);
 }
});

test("a tier only ever highlights features it actually includes", () => {
 for (const t of TIERS) {
  const has = new Set<Feature>(featuresForTier(t.id));
  for (const f of addedFeaturesForTier(t.id)) assert.ok(has.has(f), `${t.id} highlights ${f}, which it does not include`);
 }
});

test("no feature is introduced by two tiers", () => {
 const seen = new Set<Feature>();
 for (const t of byOrder) {
  for (const f of addedFeaturesForTier(t.id)) {
   assert.ok(!seen.has(f), `${f} is introduced more than once`);
   seen.add(f);
  }
 }
});

test("every feature above the entry plan is introduced by exactly one tier", () => {
 const entry = new Set<Feature>(featuresForTier(byOrder[0].id));
 const introduced = new Set<Feature>(byOrder.flatMap((t) => addedFeaturesForTier(t.id)));
 const top = featuresForTier(byOrder[byOrder.length - 1].id);
 for (const f of top) {
  if (entry.has(f)) continue;
  assert.ok(introduced.has(f), `${f} is never highlighted on any tier`);
 }
});

test("the top tier does not re-highlight what the entry plan already had", () => {
 // The seller's complaint in miniature: three columns that look the same. Whatever Starter includes
 // must render plain on Pro, or the emphasis stops meaning "new".
 const entry = featuresForTier(byOrder[0].id);
 const addedOnTop = new Set<Feature>(addedFeaturesForTier(byOrder[byOrder.length - 1].id));
 for (const f of entry) assert.ok(!addedOnTop.has(f), `${f} is on the entry plan but highlighted as new on the top tier`);
});
