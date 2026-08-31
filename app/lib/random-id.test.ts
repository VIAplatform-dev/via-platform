import { test } from "node:test";
import assert from "node:assert/strict";
import { randomId } from "./random-id.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("gives a uuid-shaped id", () => {
 assert.match(randomId(), UUID);
});

test("gives a different one each time", () => {
 const ids = new Set(Array.from({ length: 200 }, () => randomId()));
 assert.equal(ids.size, 200);
});

test("still works where crypto.randomUUID does not exist — the case that broke checkout", () => {
 // A plain-http page: `crypto` is present but `randomUUID` is not, because it is secure-context
 // only. Calling it threw, the throw escaped to React, and the checkout page died.
 const real = globalThis.crypto;
 try {
  Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: real.getRandomValues.bind(real) }, configurable: true });
  assert.match(randomId(), UUID);
 } finally {
  Object.defineProperty(globalThis, "crypto", { value: real, configurable: true });
 }
});

test("still works with no crypto at all", () => {
 const real = globalThis.crypto;
 try {
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
  assert.match(randomId(), UUID);
 } finally {
  Object.defineProperty(globalThis, "crypto", { value: real, configurable: true });
 }
});
