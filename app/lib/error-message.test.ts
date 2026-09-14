import { test } from "node:test";
import assert from "node:assert/strict";
import { describeError } from "./error-message.ts";

test("the reason comes out from under the ORM's wrapper", () => {
 // The shape that hid the broken orders table for a fortnight.
 const pg = Object.assign(new Error('column "tax_jurisdiction" of relation "orders" does not exist'), {
  code: "42703", position: "77",
 });
 const wrapped = Object.assign(new Error('Failed query: insert into "orders" ("id", "item_id") values ($1, $2)'), { cause: pg });
 const out = describeError(wrapped);
 assert.match(out, /Failed query/);
 assert.match(out, /tax_jurisdiction/);
 assert.match(out, /code 42703/);
});

test("a driver that hangs the original on sourceError is followed too", () => {
 // The Neon serverless driver does this instead of `cause`.
 const inner = Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" });
 const outer = Object.assign(new Error("Failed query"), { sourceError: inner });
 assert.match(describeError(outer), /terminating connection/);
});

test("a constraint violation names the constraint and the column", () => {
 const e = Object.assign(new Error("duplicate key value violates unique constraint"), {
  code: "23505", constraint: "orders_pi_item_uniq", detail: "Key (stripe_payment_intent, item_id) already exists.",
 });
 const out = describeError(e);
 assert.match(out, /code 23505/);
 assert.match(out, /orders_pi_item_uniq/);
 assert.match(out, /already exists/);
});

test("the same sentence is not said twice", () => {
 // An ORM often copies the driver's message onto its own wrapper.
 const inner = new Error("boom");
 const outer = Object.assign(new Error("boom"), { cause: inner });
 assert.equal(describeError(outer), "boom");
});

test("anything at all can be thrown at it", () => {
 assert.equal(describeError("just a string"), "just a string");
 assert.equal(describeError(null), "Unknown error");
 assert.equal(describeError(undefined), "Unknown error");
 assert.equal(describeError({ message: "plain object" }), "plain object");
 assert.equal(describeError(404), "404");
});

test("a circular cause chain ends rather than hanging the logger", () => {
 const a = new Error("a") as Error & { cause?: unknown };
 const b = Object.assign(new Error("b"), { cause: a });
 a.cause = b;
 assert.match(describeError(a), /^a — b$/);
});

test("it is cut to the width the log has for it", () => {
 const out = describeError(new Error("x".repeat(5000)), 100);
 assert.equal(out.length, 100);
 assert.ok(out.endsWith("…"));
});
