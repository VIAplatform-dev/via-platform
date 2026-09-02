import { test } from "node:test";
import assert from "node:assert/strict";
import { once, isDuplicateObjectError, ensureSchema } from "./db-setup.ts";

test("concurrent callers do the one-time setup exactly once", async () => {
 // Reads fired through Promise.all all reach setup before any finishes. A boolean flag
 // cannot stop that — every caller sees it false and fires its own CREATE TABLE. Postgres
 // then races creating the SERIAL column's sequence and one caller dies on a duplicate key
 // in pg_class. Memoize the in-flight promise instead.
 let runs = 0;
 const setup = once(async () => {
  runs++;
  await new Promise((r) => setTimeout(r, 10));
 });
 await Promise.all([setup(), setup(), setup()]);
 assert.equal(runs, 1);
});

test("a failed setup is not cached — the next caller retries", async () => {
 // Caching a rejected promise would turn one connection blip into permanent failure.
 let runs = 0;
 const setup = once(async () => {
  runs++;
  if (runs === 1) throw new Error("transient");
 });
 await assert.rejects(setup(), /transient/);
 await setup();
 assert.equal(runs, 2);
});

test("a concurrent creator's error is recognised as harmless", () => {
 // once() guards ONE process. Two cold serverless instances each run CREATE TABLE IF NOT
 // EXISTS and Postgres raises one of these. All mean "it exists now", which is the goal.
 assert.equal(isDuplicateObjectError({ code: "23505" }), true); // dup key in pg_class
 assert.equal(isDuplicateObjectError({ code: "42P07" }), true); // duplicate_table
 assert.equal(isDuplicateObjectError({ code: "42P16" }), true); // duplicate object
});

test("a genuine database failure is still an error", () => {
 // Swallowing everything here would turn "your database is unreachable" into a silent
 // no-op that reports zero rows forever.
 assert.equal(isDuplicateObjectError({ code: "28P01" }), false); // bad password
 assert.equal(isDuplicateObjectError({ code: "42501" }), false); // permission denied
 assert.equal(isDuplicateObjectError(new Error("connection refused")), false);
 assert.equal(isDuplicateObjectError(null), false);
});

test("ensureSchema runs once and tolerates only the duplicate race", async () => {
 let runs = 0;
 const ensure = ensureSchema(async () => {
  runs++;
  throw Object.assign(new Error("dup"), { code: "42P07" });
 });
 await ensure(); // must not throw — another instance created it
 assert.equal(runs, 1);

 const bad = ensureSchema(async () => {
  throw Object.assign(new Error("nope"), { code: "28P01" });
 });
 await assert.rejects(bad(), /nope/);
});
