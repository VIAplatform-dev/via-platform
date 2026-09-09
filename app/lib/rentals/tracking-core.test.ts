import { test } from "node:test";
import assert from "node:assert/strict";
import { whereabouts, needsRefresh, carrierStatus } from "./tracking-core.ts";

const out = { status: "out", dueBack: "2026-09-10", returnedAt: null, returnTracking: "1Z999" };

test("carrier words are normalised, and anything strange is UNKNOWN rather than a guess", () => {
 assert.equal(carrierStatus("TRANSIT"), "TRANSIT");
 assert.equal(carrierStatus("in transit"), "TRANSIT");
 assert.equal(carrierStatus("Out for delivery"), "TRANSIT");
 assert.equal(carrierStatus("DELIVERED"), "DELIVERED");
 assert.equal(carrierStatus("something new"), "UNKNOWN");
 assert.equal(carrierStatus(null), "UNKNOWN");
});

test("with no tracking it falls back to the dates the booking was made with", () => {
 const w = whereabouts({ ...out, returnTracking: null }, "2026-09-05");
 assert.equal(w.stage, "with-renter");
 assert.match(w.line, /due back Sep 10/);
});

test("past due with nothing scanned is overdue, and says exactly that", () => {
 const w = whereabouts({ ...out, returnTracking: null }, "2026-09-12");
 assert.equal(w.stage, "overdue");
 assert.match(w.line, /nothing has been scanned/);
});

test("a scan turns 'overdue' into 'on its way back' — the piece is moving", () => {
 // The whole point: a date-based guess says overdue while the carrier is holding the box.
 const w = whereabouts({ ...out, trackingStatus: "TRANSIT", trackingEta: "2026-09-13" }, "2026-09-12");
 assert.equal(w.stage, "coming-back");
 assert.match(w.line, /expected Sep 13/);
 assert.equal(w.runningLate, true, "the carrier's date is past the due date");
});

test("the carrier's estimate inside the due date isn't flagged as late", () => {
 const w = whereabouts({ ...out, trackingStatus: "TRANSIT", trackingEta: "2026-09-09" }, "2026-09-08");
 assert.equal(w.runningLate, false);
});

test("delivered but not checked in is named, not treated as done", () => {
 // The dates stay blocked until someone checks it in, and a store shouldn't have to guess why.
 const w = whereabouts({ ...out, trackingStatus: "DELIVERED" }, "2026-09-09");
 assert.equal(w.stage, "back");
 assert.match(w.line, /check it in/);
});

test("the store marking it back is the last word", () => {
 const w = whereabouts({ ...out, returnedAt: "2026-09-09T10:00:00Z", trackingStatus: "TRANSIT" }, "2026-09-09");
 assert.equal(w.stage, "back");
 assert.equal(w.line, "Back with you.");
});

test("a booking that hasn't gone out yet says so", () => {
 assert.equal(whereabouts({ ...out, status: "held" }, "2026-09-05").stage, "not-out");
});

test("we only ask the carrier when there's something to ask about", () => {
 const now = Date.parse("2026-09-09T12:00:00Z");
 assert.equal(needsRefresh({ ...out, trackingAt: null }, now), true);
 assert.equal(needsRefresh({ ...out, returnTracking: null }, now), false, "no label, nothing to ask");
 assert.equal(needsRefresh({ ...out, trackingStatus: "DELIVERED", trackingAt: null }, now), false, "it's home");
 assert.equal(needsRefresh({ ...out, trackingAt: "2026-09-09T11:50:00Z" }, now), false, "asked ten minutes ago");
 assert.equal(needsRefresh({ ...out, trackingAt: "2026-09-09T09:00:00Z" }, now), true, "three hours is long enough");
});
