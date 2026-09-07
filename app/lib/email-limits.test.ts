import { test } from "node:test";
import assert from "node:assert/strict";
import { maySendCampaign, campaignAllowance, allowanceLabel, monthStart } from "./email-limits.ts";

test("automatic emails are never metered — only campaigns are", () => {
 // Nothing here can refuse an order confirmation or an abandoned basket. Those fire because a
 // shopper did something, and a shop's receipts must not depend on its plan.
 assert.equal(campaignAllowance("starter"), 0);
 assert.equal(campaignAllowance("studio"), 4);
 assert.equal(campaignAllowance("atelier"), null, "no limit");
});

test("a store with no plan is treated as the lowest, not as unlimited", () => {
 // Failing open here would make the limit optional: cancel, keep sending.
 assert.equal(campaignAllowance(null), 0);
 assert.equal(campaignAllowance(undefined), 0);
});

test("Starter is told what it CAN do, not only what it can't", () => {
 const v = maySendCampaign("starter", 0);
 assert.equal(v.ok, false);
 assert.match((v as { reason: string }).reason, /Studio and Pro/);
 // A shop on Starter is still sending the emails that make her money.
 assert.match((v as { reason: string }).reason, /keep sending on every plan/);
});

test("Studio gets four, and the fifth is refused with a date", () => {
 assert.deepEqual(maySendCampaign("studio", 0), { ok: true, remaining: 4 });
 assert.deepEqual(maySendCampaign("studio", 3), { ok: true, remaining: 1 });
 const v = maySendCampaign("studio", 4);
 assert.equal(v.ok, false);
 assert.match((v as { reason: string }).reason, /1st/);
});

test("Pro is never counted", () => {
 assert.deepEqual(maySendCampaign("atelier", 999), { ok: true, remaining: null });
});

test("the composer says the limit before she writes, not after", () => {
 assert.match(allowanceLabel("studio", 0), /4 of 4/);
 assert.match(allowanceLabel("studio", 3), /1 of 4/);
 assert.match(allowanceLabel("studio", 4), /No campaigns left/);
 assert.match(allowanceLabel("atelier", 50), /Unlimited/);
 assert.match(allowanceLabel("starter", 0), /every plan/);
});

test("a month starts on the 1st", () => {
 assert.equal(monthStart(new Date("2026-09-19T22:00:00Z")).toISOString(), "2026-09-01T00:00:00.000Z");
});
