import { test } from "node:test";
import assert from "node:assert/strict";
import { rentalDay, bookingLine, trackingLine, rentalsTileLine, todayDay, type Booking } from "./rentals.ts";

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
