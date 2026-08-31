import { test } from "node:test";
import assert from "node:assert/strict";
import {
 canTransition,
 isAvailable,
 reservationExpired,
 reservationExpiry,
 ITEM_TRANSITIONS,
 DEFAULT_RESERVATION_TTL_SECONDS,
} from "./inventory-core.ts";

test("an active item can be reserved", () => {
 assert.equal(canTransition("active", "reserved"), true);
});

test("a sold item can never become available again (no double-sell)", () => {
 assert.equal(canTransition("sold", "reserved"), false);
 assert.equal(canTransition("sold", "active"), false);
 assert.equal(canTransition("sold", "draft"), false);
});

test("a reserved item releases back to active or converts to sold", () => {
 assert.equal(canTransition("reserved", "active"), true);
 assert.equal(canTransition("reserved", "sold"), true);
});

test("you cannot reserve an item that is already reserved", () => {
 assert.equal(canTransition("reserved", "reserved"), false);
});

test("draft cannot jump straight to sold (a sale always passes through a reservation)", () => {
 assert.equal(canTransition("draft", "sold"), false);
});

test("removed is terminal", () => {
 assert.deepEqual(ITEM_TRANSITIONS.removed, []);
});

test("only active items are buyable", () => {
 assert.equal(isAvailable("active"), true);
 for (const s of ["draft", "reserved", "sold", "removed"] as const) assert.equal(isAvailable(s), false);
});

test("reservation expiry math is exact at the boundary", () => {
 const now = new Date("2026-01-01T00:00:00.000Z");
 const exp = reservationExpiry(600, now); // +10 min
 assert.equal(exp.toISOString(), "2026-01-01T00:10:00.000Z");
 assert.equal(reservationExpired(exp, new Date("2026-01-01T00:09:59.999Z")), false);
 assert.equal(reservationExpired(exp, new Date("2026-01-01T00:10:00.000Z")), true); // inclusive
});

test("default TTL is a sane checkout hold", () => {
 assert.ok(DEFAULT_RESERVATION_TTL_SECONDS >= 120 && DEFAULT_RESERVATION_TTL_SECONDS <= 1800);
});

// ── Market Mode: a quick-listed draft can be sold in person ─────────────────────
test("a draft can be reserved for an in-person sale (market checkout)", () => {
 assert.equal(canTransition("draft", "reserved"), true);
});
