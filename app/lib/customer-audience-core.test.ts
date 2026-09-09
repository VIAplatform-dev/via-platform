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
 assert.deepEqual(parseAudience({ tag: "vip,market:brick-lane", spentOver: "50", category: "bags" }), { tags: ["vip", "market:brick-lane"], spentOverCents: 5_000, category: "bags", notOrderedInDays: null });
 assert.deepEqual(parseAudience({ tag: ["vip", "b"] }), { tags: ["vip", "b"], spentOverCents: null, category: null, notOrderedInDays: null });
 assert.deepEqual(parseAudience({ spentOver: "abc" }), { tags: [], spentOverCents: null, category: null, notOrderedInDays: null });
 assert.deepEqual(parseAudience({}), { tags: [], spentOverCents: null, category: null, notOrderedInDays: null });
});

test("an audience describes itself in words", () => {
 assert.equal(describeAudience({}), "Everyone");
 assert.equal(describeAudience({ tags: ["vip"] }), "Tagged vip");
 assert.equal(describeAudience({ tags: ["vip", "new"], spentOverCents: 5_000, category: "bags" }, "£"), "Tagged vip or new · spent over £50 · bought bags");
});

// ── Win-back: "send to those who haven't shopped in a while" ────────────────────────────────────
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const person = (email: string, lastOrderAt: string | null, extra: Partial<AudienceCustomer> = {}): AudienceCustomer =>
 ({ email, tags: [], spentCents: 5000, categories: [], lastOrderAt, ...extra });

test("a win-back reaches customers who drifted, not the ones who just bought", () => {
 const people = [person("lapsed@x.com", ago(200)), person("recent@x.com", ago(10))];
 assert.deepEqual(filterCustomers(people, { notOrderedInDays: 90 }).map((c) => c.email), ["lapsed@x.com"]);
});

test("someone who has never ordered is not a win-back", () => {
 // An imported contact who never bought is a different email entirely. Sweeping them in would turn
 // a win-back into a send-to-everyone without the seller noticing.
 const people = [person("never@x.com", null), person("lapsed@x.com", ago(200))];
 assert.deepEqual(filterCustomers(people, { notOrderedInDays: 90 }).map((c) => c.email), ["lapsed@x.com"]);
});

test("an unreadable last-order date is left out rather than guessed at", () => {
 assert.deepEqual(filterCustomers([person("odd@x.com", "not a date")], { notOrderedInDays: 90 }), []);
});

test("the boundary is the day itself, not a day either side", () => {
 assert.equal(filterCustomers([person("a@x.com", ago(91))], { notOrderedInDays: 90 }).length, 1);
 assert.equal(filterCustomers([person("a@x.com", ago(89))], { notOrderedInDays: 90 }).length, 0);
});

test("a win-back stacks with the other filters rather than replacing them", () => {
 const people = [
  person("vip-lapsed@x.com", ago(200), { tags: ["vip"] }),
  person("plain-lapsed@x.com", ago(200)),
  person("vip-recent@x.com", ago(2), { tags: ["vip"] }),
 ];
 assert.deepEqual(filterCustomers(people, { tags: ["vip"], notOrderedInDays: 90 }).map((c) => c.email), ["vip-lapsed@x.com"]);
});

test("a win-back is not an empty audience, and it says so in words", () => {
 assert.equal(audienceIsEmpty({ notOrderedInDays: 90 }), false);
 assert.match(describeAudience({ notOrderedInDays: 90 }), /hasn't ordered in 90 days/);
});

test("the days survive a round trip through the query string", () => {
 assert.equal(parseAudience({ notOrderedInDays: "90" }).notOrderedInDays, 90);
 assert.equal(parseAudience({ notOrderedInDays: "0" }).notOrderedInDays, null);
 assert.equal(parseAudience({ notOrderedInDays: "-5" }).notOrderedInDays, null);
 assert.equal(parseAudience({}).notOrderedInDays, null);
});
