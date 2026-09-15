import { test } from "node:test";
import assert from "node:assert/strict";
import { rentalDay, bookingLine, trackingLine, rentalsTileLine, todayDay, type Booking, rentalState, filterRentalItems, countByState, fromPrice, stateLine, type RentalItem } from "./rentals.ts";

const TODAY = "2026-09-11";
const b = (over: Partial<Booking>): Booking => ({ id: "b", itemId: "i", status: "booked", shipBy: null, dueBack: null, returnedAt: null, ...over });

test("what leaves today, what comes back today", () => {
  const d = rentalDay([
    b({ id: "ship", status: "booked", shipBy: TODAY }),
    b({ id: "back", status: "out", dueBack: TODAY }),
  ], TODAY);
  assert.deepEqual(d.goingOut.map((x) => x.id), ["ship"]);
  assert.deepEqual(d.comingBack.map((x) => x.id), ["back"]);
  assert.deepEqual(d.overdue, []);
});

test("overdue is its own list, not the bottom of today's returns", () => {
  // A piece due yesterday is a phone call, not a return. Burying it is how it stays lost.
  const d = rentalDay([
    b({ id: "late", status: "out", dueBack: "2026-09-08" }),
    b({ id: "today", status: "out", dueBack: TODAY }),
  ], TODAY);
  assert.deepEqual(d.overdue.map((x) => x.id), ["late"]);
  assert.deepEqual(d.comingBack.map((x) => x.id), ["today"]);
});

test("the longest gone is named first", () => {
  const d = rentalDay([
    b({ id: "a", status: "out", dueBack: "2026-09-09" }),
    b({ id: "b", status: "due", dueBack: "2026-09-02" }),
  ], TODAY);
  assert.deepEqual(d.overdue.map((x) => x.id), ["b", "a"]);
});

test("a piece already back is neither due nor overdue", () => {
  const d = rentalDay([b({ id: "done", status: "returned", dueBack: "2026-09-01", returnedAt: "2026-09-02" })], TODAY);
  assert.deepEqual(d.overdue, []);
  assert.deepEqual(d.comingBack, []);
});

test("closed, cancelled and expired bookings say nothing about today", () => {
  const d = rentalDay([
    b({ status: "closed", dueBack: TODAY }),
    b({ status: "cancelled", shipBy: TODAY }),
    b({ status: "expired", dueBack: "2026-01-01" }),
  ], TODAY);
  assert.deepEqual(d, { goingOut: [], comingBack: [], overdue: [], out: [] });
});

test("the line says who has it and when it's back", () => {
  assert.equal(bookingLine(b({ status: "out", renterName: "Marta", dueBack: TODAY }), TODAY), "Marta · due back today");
  assert.equal(bookingLine(b({ status: "out", renterName: "Marta", dueBack: "2026-09-20" }), TODAY), "Marta · back 2026-09-20");
  assert.equal(bookingLine(b({ status: "booked", renterName: "Ana", shipBy: TODAY }), TODAY), "Ana · ships 2026-09-11");
  assert.equal(bookingLine(b({ status: "returned", renterName: "Ana", returnedAt: TODAY }), TODAY), "Back from Ana");
});

test("tracking speaks only when the carrier has said something", () => {
  assert.equal(trackingLine(b({})), null);
  assert.equal(trackingLine(b({ trackingStatus: "In transit", trackingEta: "2026-09-14" })), "In transit · due 2026-09-14");
});

test("the tile leads with overdue, because that is the one that needs her", () => {
  assert.equal(rentalsTileLine(rentalDay([b({ status: "out", dueBack: "2026-09-01" }), b({ status: "booked", shipBy: TODAY })], TODAY)), "1 overdue");
  assert.equal(rentalsTileLine(rentalDay([b({ status: "booked", shipBy: TODAY })], TODAY)), "1 out today");
  assert.equal(rentalsTileLine(rentalDay([], TODAY)), "Nothing out");
});

test("today is a local day, not a UTC instant", () => {
  assert.equal(todayDay(new Date(2026, 8, 11, 23, 30)), "2026-09-11");
  assert.equal(todayDay(new Date(2026, 0, 5, 0, 10)), "2026-01-05");
});

/* ── the catalogue ─────────────────────────────────────────────────────── */

// The screen used to show the DAY only: bookings going out, coming back, late. A shop with
// fourteen rentable pieces and a quiet week read "Nothing out and nothing booked", which is true
// and answers no question a seller has. These are the pieces themselves.

const CAT_TODAY = "2026-09-15";
const item = (p: Partial<RentalItem> = {}): RentalItem => ({
  itemId: "i1", title: "Silk slip", image: null, itemStatus: "active",
  tiers: [{ days: 4, cents: 4500 }], replacementCents: 30000,
  bookingStatus: null, dueBack: null, shipBy: null, ...p,
});

test("no live booking means it is available", () => {
  assert.equal(rentalState(item(), CAT_TODAY), "available");
  // A finished booking says nothing about the piece today.
  assert.equal(rentalState(item({ bookingStatus: "closed" }), CAT_TODAY), "available");
});

test("promised, gone, and late are three different answers", () => {
  assert.equal(rentalState(item({ bookingStatus: "approved" }), CAT_TODAY), "booked");
  assert.equal(rentalState(item({ bookingStatus: "out", dueBack: "2026-09-20" }), CAT_TODAY), "out");
  assert.equal(rentalState(item({ bookingStatus: "out", dueBack: "2026-09-12" }), CAT_TODAY), "overdue");
  // Due back today is not late yet.
  assert.equal(rentalState(item({ bookingStatus: "due", dueBack: CAT_TODAY }), CAT_TODAY), "out");
});

test("a piece she no longer has is never offered as available", () => {
  assert.equal(rentalState(item({ itemStatus: "sold" }), CAT_TODAY), "unavailable");
  assert.equal(rentalState(item({ itemStatus: "draft" }), CAT_TODAY), "unavailable");
  // Reserved is mid-sale, not gone: it still has rental terms and still shows.
  assert.equal(rentalState(item({ itemStatus: "reserved" }), CAT_TODAY), "available");
});

test("filtering and counting agree with each other", () => {
  const items = [
    item({ itemId: "a" }),
    item({ itemId: "b", bookingStatus: "approved" }),
    item({ itemId: "c", bookingStatus: "out", dueBack: "2026-09-20" }),
    item({ itemId: "d", bookingStatus: "out", dueBack: "2026-09-01" }),
  ];
  assert.deepEqual(filterRentalItems(items, "all", CAT_TODAY).map((i) => i.itemId), ["a", "b", "c", "d"]);
  assert.deepEqual(filterRentalItems(items, "available", CAT_TODAY).map((i) => i.itemId), ["a"]);
  assert.deepEqual(filterRentalItems(items, "overdue", CAT_TODAY).map((i) => i.itemId), ["d"]);
  const counts = countByState(items, CAT_TODAY);
  assert.equal(counts.all, 4);
  assert.equal(counts.available, 1);
  assert.equal(counts.booked, 1);
  assert.equal(counts.out, 1);
  assert.equal(counts.overdue, 1);
});

test("the price is the cheapest tier, which is the one a shopper sees first", () => {
  assert.equal(fromPrice(item({ tiers: [{ days: 8, cents: 8000 }, { days: 4, cents: 4500 }] })), "$45 for 4 days");
  assert.equal(fromPrice(item({ tiers: [{ days: 1, cents: 2000 }] })), "$20 for 1 day");
  // A piece with terms but no priced tier has no "from" price rather than a $0 one.
  assert.equal(fromPrice(item({ tiers: [] })), null);
  assert.equal(fromPrice(item({ tiers: [{ days: 4, cents: 0 }] })), null);
});

test("the line under a piece says who has it and until when", () => {
  assert.equal(stateLine(item(), CAT_TODAY), "Available");
  assert.equal(stateLine(item({ bookingStatus: "out", dueBack: "2026-09-20", renterName: "Mia" }), CAT_TODAY), "Out until 2026-09-20 · Mia");
  assert.equal(stateLine(item({ bookingStatus: "out", dueBack: "2026-09-01" }), CAT_TODAY), "Overdue since 2026-09-01");
  assert.equal(stateLine(item({ bookingStatus: "approved", shipBy: "2026-09-18" }), CAT_TODAY), "Booked · ships 2026-09-18");
  assert.equal(stateLine(item({ itemStatus: "sold" }), CAT_TODAY), "Sold");
});
