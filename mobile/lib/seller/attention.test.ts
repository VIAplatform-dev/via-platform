import { test } from "node:test";
import assert from "node:assert/strict";
import { needsYouRows, type AttentionRow } from "./attention.ts";

// The server's "Needs you" rows (app/lib/attention-core.ts) folded into the phone's list, which
// already draws its own hold rows (with the customer's name), its own unread messages, and its
// own consignor payouts line. Nothing should appear twice.

const row = (id: string, label: string, count = 1, href = `/admin/${id}`, urgent = true): AttentionRow => ({ id, label, count, href, urgent });

test("each row gets a Feather icon that says what kind of thing it is", () => {
  const out = needsYouRows([
    row("noPhoto", "3 pieces without a photo", 3), row("unpriced", "1 unpriced piece"), row("lowConfidence", "2 AI prices to check", 2),
    row("costMissing", "4 pieces with no cost", 4), row("pickupsWaiting", "2 collections waiting", 2), row("unanswered24h", "1 message waiting over a day"),
    row("payoutsDue", "1 consignor payout due"), row("crossListingFailed", "1 piece failed to post"),
  ], { holdsShown: false, payoutsShown: false });
  assert.deepEqual(out.map((r) => [r.key, r.icon]), [
    ["noPhoto", "camera"], ["unpriced", "tag"], ["lowConfidence", "help-circle"], ["costMissing", "dollar-sign"],
    ["pickupsWaiting", "package"], ["unanswered24h", "mail"], ["payoutsDue", "archive"], ["crossListingFailed", "alert-circle"],
  ]);
  assert.equal(out[0].title, "3 pieces without a photo");
  assert.equal(out[0].href, "/admin/noPhoto");
});

test("what the screen already shows is not shown again", () => {
  const rows = [row("holdsToday", "Holds lapse today"), row("payoutsDue", "1 consignor payout due"), row("noPhoto", "1 piece without a photo")];
  assert.deepEqual(needsYouRows(rows, { holdsShown: true, payoutsShown: true }).map((r) => r.key), ["noPhoto"]);
  assert.deepEqual(needsYouRows(rows, { holdsShown: false, payoutsShown: false }).map((r) => r.key), ["holdsToday", "payoutsDue", "noPhoto"]);
});

test("aging is the Inventory tile's line, never a Needs-you row; unknown ids are ignored", () => {
  const rows = [row("aging", "Listed over 90 days", 2), row("somethingNew", "?", 1), row("unpriced", "1 unpriced piece")];
  assert.deepEqual(needsYouRows(rows, { holdsShown: false, payoutsShown: false }).map((r) => r.key), ["unpriced"]);
});

test("a row that opens in the app lands on the right filter; the rest open the web workspace", () => {
  const out = needsYouRows([
    row("pickupsWaiting", "1 collection waiting"), row("unanswered24h", "1 message waiting over a day"), row("noPhoto", "1 piece without a photo"),
    row("unpriced", "1 unpriced piece"), row("costMissing", "2 pieces with no cost"), row("lowConfidence", "1 AI price to check"), row("crossListingFailed", "1 failed"),
  ], { holdsShown: false, payoutsShown: false });
  assert.deepEqual(out[0].route, { pathname: "/(seller)/orders", params: { filter: "pickup" } });
  assert.deepEqual(out[1].route, { pathname: "/(seller)/inbox" });
  assert.deepEqual(out[2].route, { pathname: "/(seller)/inventory", params: { missing: "photo" } });
  assert.deepEqual(out[3].route, { pathname: "/(seller)/inventory", params: { missing: "price" } });
  assert.deepEqual(out[4].route, { pathname: "/(seller)/inventory", params: { missing: "cost" } });
  assert.deepEqual(out[5].route, { pathname: "/(seller)/inventory", params: { missing: "confidence" } });
  assert.equal(out[6].route, null);
});
