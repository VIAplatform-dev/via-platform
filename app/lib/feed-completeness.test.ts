import { test } from "node:test";
import assert from "node:assert/strict";
import { readEndedCleanly, maySweepMissing, sweepRefusal } from "./feed-completeness.ts";

// A read of the seller's catalogue either reached the end of it or it didn't. Only the first kind
// licenses "everything I did not see has been taken down" — the rule that marks pieces sold.

test("a read that ran out of products reached the end", () => {
 // The last page came back short, which is how a catalogue ends.
 assert.equal(readEndedCleanly({ pagesRead: 4, lastPageFull: false, hitCap: false, failed: false }), true);
});

test("a read stopped by our own ceiling did NOT reach the end", () => {
 // 1,500 pieces read on a shop with 1,837. The other 337 are not gone; we just stopped looking.
 assert.equal(readEndedCleanly({ pagesRead: 30, lastPageFull: true, hitCap: true, failed: false }), false);
});

test("a read that failed part-way did NOT reach the end", () => {
 assert.equal(readEndedCleanly({ pagesRead: 7, lastPageFull: true, hitCap: false, failed: true }), false);
});

test("a full last page with no cap and no failure is still not an ending", () => {
 // The loop can only stop for one of three reasons. A full final page with none of them recorded
 // means something ended the read that we did not account for — assume the worst.
 assert.equal(readEndedCleanly({ pagesRead: 3, lastPageFull: true, hitCap: false, failed: false }), false);
});

test("a catalogue that ends on an exact page boundary is still a complete read", () => {
 // shop-vintage-charm holds exactly 1,550 pieces and the reader pages by 50. Page 31 comes back
 // full, page 32 comes back empty — which is what a real ending looks like at a page boundary AND
 // what a throttled page looks like. Treating it as a throttle refused the sweep on that store for
 // ever. The reader now retries the empty page: still empty means the catalogue really did end.
 assert.equal(readEndedCleanly({ pagesRead: 31, lastPageFull: false, hitCap: false, failed: false }), true);
});

test("a read returning nothing at all never licenses a sweep", () => {
 // The most dangerous case: a timeout hands back an empty feed. Sweeping on it would mark the
 // seller's ENTIRE catalogue sold in one pass.
 assert.equal(maySweepMissing({ complete: true, productsRead: 0, held: 1589 }), false);
});

test("a complete read of a real catalogue licenses the sweep", () => {
 assert.equal(maySweepMissing({ complete: true, productsRead: 1837, held: 1589, wouldRemove: 10 }), true);
});

test("an incomplete read never licenses the sweep, however much it read", () => {
 assert.equal(maySweepMissing({ complete: false, productsRead: 1500, held: 1589 }), false);
});

test("a read that would wipe out most of the store is refused even when it claims to be complete", () => {
 // chill-boutique holds 1,589. A "complete" read of 12 is a broken feed, not a closing-down sale.
 // Belt and braces: the completeness flag is computed from a loop that has been wrong before.
 assert.equal(maySweepMissing({ complete: true, productsRead: 12, held: 1589 }), false);
});

test("a genuinely small shop is not mistaken for a broken feed", () => {
 assert.equal(maySweepMissing({ complete: true, productsRead: 14, held: 16, wouldRemove: 2 }), true);
});

test("a store with nothing held yet can always sweep — there is nothing to lose", () => {
 assert.equal(maySweepMissing({ complete: true, productsRead: 0, held: 0 }), true);
});

test("the refusal says which reason applied, in words the log reader can act on", () => {
 assert.match(sweepRefusal({ complete: false, productsRead: 1500, held: 1589 })!, /did not reach the end/i);
 assert.match(sweepRefusal({ complete: true, productsRead: 0, held: 100 })!, /returned no products/i);
 assert.match(sweepRefusal({ complete: true, productsRead: 12, held: 1589 })!, /1%|too few|fraction/i);
 assert.equal(sweepRefusal({ complete: true, productsRead: 1837, held: 1589, wouldRemove: 10 }), null);
});

// ── the hole the ratio rule leaves open ──────────────────────────────────────────────────────────
// The checks above only look at how BIG the read was. A throttle that cuts a read off two thirds of
// the way through passes every one of them: 1,000 products read against 1,572 held is not a small
// read, is not an empty read, and the loop may well believe it ended cleanly. What it would DO is
// the thing worth refusing — marking 572 live pieces sold in one pass.

test("a run that would mark a third of the shop sold is refused however healthy the read looked", () => {
 // A throttle at page 20 of 31 on shop-vintage-charm looks exactly like this.
 assert.equal(maySweepMissing({ complete: true, productsRead: 1000, held: 1572, wouldRemove: 572 }), false);
 assert.match(sweepRefusal({ complete: true, productsRead: 1000, held: 1572, wouldRemove: 572 })!, /36%|too many|at once/i);
});

test("an ordinary week's sales sweep normally", () => {
 // 30 pieces sold out of 1,572 is a good week, not a fault.
 assert.equal(maySweepMissing({ complete: true, productsRead: 1542, held: 1572, wouldRemove: 30 }), true);
});

test("a small shop can still lose several pieces without tripping the cap", () => {
 // Proportion, not a raw count: 3 of 16 on lamash is one afternoon at a market.
 assert.equal(maySweepMissing({ complete: true, productsRead: 13, held: 16, wouldRemove: 3 }), true);
});

test("a genuine clear-out is refused too — loudly, rather than done silently", () => {
 // If a seller really has retired half their catalogue, a human should confirm it. The cost of
 // pausing is that sold pieces linger; the cost of proceeding wrongly is live stock going dark.
 assert.equal(maySweepMissing({ complete: true, productsRead: 800, held: 1572, wouldRemove: 772 }), false);
});

test("not being told what it would remove is treated as unknown, and refused", () => {
 assert.equal(maySweepMissing({ complete: true, productsRead: 1542, held: 1572 }), false);
});

// ── the share cap is a guess, so it must be overridable ──────────────────────────────────────────
// We have no history to calibrate it against: every sold mark in the database was written by one
// fleet run. So the cap cannot claim "a shop never loses this much" — it can only say "this is
// unusual, a person should confirm it". These tests pin that distinction.

test("a person can approve an unusually large clear-out", () => {
 const big = { complete: true, productsRead: 800, held: 1572, wouldRemove: 772 };
 assert.equal(maySweepMissing(big), false, "not by default");
 assert.equal(maySweepMissing({ ...big, approvedLargeSweep: true }), true, "but a human may say yes");
});

test("approval cannot override not knowing what we read", () => {
 // The share cap is a judgement call. An incomplete read is not — no amount of confirmation makes
 // a truncated read evidence that anything was taken down.
 assert.equal(maySweepMissing({ complete: false, productsRead: 1000, held: 1572, wouldRemove: 572, approvedLargeSweep: true }), false);
 assert.equal(maySweepMissing({ complete: true, productsRead: 0, held: 1572, wouldRemove: 1572, approvedLargeSweep: true }), false);
});

test("a handful of pieces never trips the cap, whatever the percentage", () => {
 // A 4-piece shop selling 1 piece is 25%, and that is an ordinary Tuesday, not an anomaly.
 assert.equal(maySweepMissing({ complete: true, productsRead: 3, held: 4, wouldRemove: 1 }), true);
 assert.equal(maySweepMissing({ complete: true, productsRead: 12, held: 20, wouldRemove: 8 }), true);
});

test("the refusal tells the operator how to proceed if it really is a clear-out", () => {
 assert.match(sweepRefusal({ complete: true, productsRead: 800, held: 1572, wouldRemove: 772 })!, /--allow-large-sweep/);
});
