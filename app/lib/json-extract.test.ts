import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFirstJsonObject, parseFirstJsonObject } from "./json-extract.ts";

// The live failure: a correct valuation was discarded because the reply ended with a markdown
// fence, and first-brace-to-last-brace captured the backticks too.
test("a fenced reply parses instead of being thrown away", () => {
 const reply = '```json\n{"marketCents":55000,"rationale":"anchored to the same piece"}\n```';
 assert.deepEqual(parseFirstJsonObject(reply), { marketCents: 55000, rationale: "anchored to the same piece" });
});

test("prose before AND after the object", () => {
 assert.deepEqual(parseFirstJsonObject('Sure:\n{"a":1}\nLet me know if you need more.'), { a: 1 });
});

test("a brace inside a string doesn't end the object early", () => {
 assert.deepEqual(parseFirstJsonObject('{"rationale":"fits sizes {S,M}","marketCents":99}'), { rationale: "fits sizes {S,M}", marketCents: 99 });
});

test("escaped quotes survive", () => {
 assert.deepEqual(parseFirstJsonObject('{"rationale":"the \\"grail\\" piece","n":7}'), { rationale: 'the "grail" piece', n: 7 });
});

test("nested objects return the whole thing, not the first inner one", () => {
 assert.deepEqual(parseFirstJsonObject('{"a":{"b":2},"c":3}'), { a: { b: 2 }, c: 3 });
});

test("a genuinely truncated reply returns null rather than half an object", () => {
 assert.equal(extractFirstJsonObject('{"marketCents":5,"rationale":"cut o'), null);
 assert.equal(parseFirstJsonObject('{"marketCents":5,"rationale":"cut o'), null);
});

test("no JSON at all is null, never a throw", () => {
 assert.equal(parseFirstJsonObject("I couldn't price this."), null);
 assert.equal(parseFirstJsonObject(""), null);
});

test("a second object after the first is ignored", () => {
 // The old greedy match would have spanned both and thrown.
 assert.deepEqual(parseFirstJsonObject('{"a":1}\nexample: {"b":2}'), { a: 1 });
});
