import { test } from "node:test";
import assert from "node:assert/strict";
import { filterCustomers, parseAudience, describeAudience, audienceIsEmpty, type AudienceCustomer } from "./customer-audience-core.ts";

const c = (email: string, o: Partial<AudienceCustomer> = {}): AudienceCustomer => ({ email, tags: [], spentCents: 0, categories: [], ...o });
const ana = c("ana@x.com", { tags: ["vip", "market:brick-lane"], spentCents: 25_000, categories: ["bags", "coats"] });
const bo = c("bo@x.com", { tags: ["vip"], spentCents: 5_000, categories: ["shoes"] });
const cy = c("cy@x.com", { tags: [], spentCents: 0, categories: [] });
const dee = c("dee@x.com", { tags: ["market:brick-lane"], spentCents: 5_000, categories: ["bags"] });
const ALL = [ana, bo, cy, dee];

test("an empty filter is everyone", () => {
 assert.deepEqual(filterCustomers(ALL, {}), ALL);
 assert.deepEqual(filterCustomers(ALL, { tags: [], spentOverCents: null, category: null }), ALL);
 assert.equal(audienceIsEmpty({}), true);
 assert.equal(audienceIsEmpty({ tags: ["vip"] }), false);
});

test("tags are any-of, case-insensitive", () => {
 assert.deepEqual(filterCustomers(ALL, { tags: ["vip"] }).map((x) => x.email), ["ana@x.com", "bo@x.com"]);
 assert.deepEqual(filterCustomers(ALL, { tags: ["VIP", "market:brick-lane"] }).map((x) => x.email), ["ana@x.com", "bo@x.com", "dee@x.com"]);
});

test("spent over is strictly more than the amount", () => {
 assert.deepEqual(filterCustomers(ALL, { spentOverCents: 5_000 }).map((x) => x.email), ["ana@x.com"]);
 assert.deepEqual(filterCustomers(ALL, { spentOverCents: 4_999 }).map((x) => x.email), ["ana@x.com", "bo@x.com", "dee@x.com"]);
 assert.deepEqual(filterCustomers(ALL, { spentOverCents: 0 }).map((x) => x.email), ["ana@x.com", "bo@x.com", "dee@x.com"]);
});

test("bought in a category matches the customer's order history, case-insensitive", () => {
 assert.deepEqual(filterCustomers(ALL, { category: "Bags" }).map((x) => x.email), ["ana@x.com", "dee@x.com"]);
 assert.deepEqual(filterCustomers(ALL, { category: "hats" }), []);
});

test("the three compose with AND", () => {
 assert.deepEqual(filterCustomers(ALL, { tags: ["market:brick-lane"], spentOverCents: 6_000, category: "bags" }).map((x) => x.email), ["ana@x.com"]);
 assert.deepEqual(filterCustomers(ALL, { tags: ["vip"], category: "bags" }).map((x) => x.email), ["ana@x.com"]);
});

test("the filter reads from a query string the same way the page writes it", () => {
 assert.deepEqual(parseAudience({ tag: "vip,market:brick-lane", spentOver: "50", category: "bags" }), { tags: ["vip", "market:brick-lane"], spentOverCents: 5_000, category: "bags" });
 assert.deepEqual(parseAudience({ tag: ["vip", "b"] }), { tags: ["vip", "b"], spentOverCents: null, category: null });
 assert.deepEqual(parseAudience({ spentOver: "abc" }), { tags: [], spentOverCents: null, category: null });
 assert.deepEqual(parseAudience({}), { tags: [], spentOverCents: null, category: null });
});

test("an audience describes itself in words", () => {
 assert.equal(describeAudience({}), "Everyone");
 assert.equal(describeAudience({ tags: ["vip"] }), "Tagged vip");
 assert.equal(describeAudience({ tags: ["vip", "new"], spentOverCents: 5_000, category: "bags" }, "£"), "Tagged vip or new · spent over £50 · bought bags");
});
