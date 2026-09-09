import { test } from "node:test";
import assert from "node:assert/strict";
import { areasFor, can, normalisePermissions, summarise, AREAS, DEFAULT_STAFF } from "./store-permissions.ts";

test("an owner can do everything, whatever is stored against them", () => {
 const owner = { role: "owner" as const, permissions: [] };
 assert.equal(areasFor(owner).length, AREAS.length);
 assert.equal(can(owner, "costs"), true);
 assert.equal(can(owner, "billing"), true);
 assert.equal(can(owner, "people"), true);
});

test("billing and access are the owner's alone — no permission grants them", () => {
 const staff = { role: "staff" as const, permissions: AREAS.map((a) => a.key) };
 assert.equal(can(staff, "settings"), true, "store settings can be given");
 assert.equal(can(staff, "billing"), false);
 assert.equal(can(staff, "people"), false);
});

test("staff with nothing chosen get the everyday set, and no money", () => {
 // Nobody who already had access should lose it the day this ships.
 const staff = { role: "staff" as const, permissions: null };
 assert.deepEqual(areasFor(staff), DEFAULT_STAFF);
 assert.equal(can(staff, "inventory"), true);
 assert.equal(can(staff, "costs"), false, "what a piece cost is not everyday work");
 assert.equal(can(staff, "numbers"), false);
});

test("an empty list means 'nothing', not 'unset'", () => {
 // An owner who deliberately unticks everything must not have it read as never-chosen.
 const staff = { role: "staff" as const, permissions: [] };
 assert.deepEqual(areasFor(staff), []);
 assert.equal(can(staff, "inventory"), false);
});

test("whatever the form sends is cleaned before it's stored", () => {
 assert.deepEqual(normalisePermissions(["orders", "orders", "nonsense", 7, null]), ["orders"]);
 assert.deepEqual(normalisePermissions("orders"), [], "not a list, so nothing");
 // Catalogue order, not the order they arrived in — so two identical sets compare equal.
 assert.deepEqual(normalisePermissions(["orders", "inventory"]), ["inventory", "orders"]);
});

test("the row summary says something true at each extreme", () => {
 assert.match(summarise({ role: "owner" }), /Everything/);
 assert.match(summarise({ role: "staff", permissions: [] }), /Nothing yet/);
 assert.match(summarise({ role: "staff", permissions: AREAS.map((a) => a.key) }), /except billing/);
 assert.match(summarise({ role: "staff", permissions: ["orders"] }), /1 of \d+/);
});
