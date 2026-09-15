import { test } from "node:test";
import assert from "node:assert/strict";
import {
 isBotUserAgent,
 isInternalOrSeller,
 markBursts,
 partitionEvents,
 type EventFilterConfig,
 type FilterableEvent,
} from "./event-filters.ts";
import { EVENT_FILTERS } from "./config.ts";

// The real config drives the tests. Exercises the actual shipped thresholds.
const CONFIG: EventFilterConfig = EVENT_FILTERS;
const BURST = { minGapSeconds: 5, maxPerUserProductPerDay: 100 };

const CHROME =
 "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const IPHONE =
 "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

// ── isBotUserAgent ──────────────────────────────────────────────────────────
test("isBotUserAgent: flags crawlers / automation, spares real browsers", () => {
 const p = CONFIG.botUserAgentPatterns;
 assert.equal(isBotUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)", p), true);
 assert.equal(isBotUserAgent("facebookexternalhit/1.1", p), true);
 assert.equal(isBotUserAgent("curl/8.4.0", p), true);
 assert.equal(isBotUserAgent("python-requests/2.31.0", p), true);
 assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; bingbot/2.0)", p), true);
 assert.equal(isBotUserAgent("HeadlessChrome/124.0", p), true);
 assert.equal(isBotUserAgent(CHROME, p), false);
 assert.equal(isBotUserAgent(IPHONE, p), false);
});

test("isBotUserAgent: a missing UA is NOT a bot (most tables store none)", () => {
 const p = CONFIG.botUserAgentPatterns;
 assert.equal(isBotUserAgent(null, p), false);
 assert.equal(isBotUserAgent(undefined, p), false);
 assert.equal(isBotUserAgent("", p), false);
});

test("isBotUserAgent: custom pattern list is honored", () => {
 assert.equal(isBotUserAgent("MyScraper/1.0", ["myscraper"]), true);
 assert.equal(isBotUserAgent(CHROME, ["myscraper"]), false);
});

// ── isInternalOrSeller ──────────────────────────────────────────────────────
const internalOpts = {
 internalEmails: CONFIG.internalEmails,
 internalEmailDomains: CONFIG.internalEmailDomains,
};

test("isInternalOrSeller: internal emails + domains excluded, consumers kept", () => {
 assert.equal(isInternalOrSeller("helster@me.com", internalOpts), true); // configured internal
 assert.equal(isInternalOrSeller("anyone@vyaplatform.com", internalOpts), true); // internal domain
 assert.equal(isInternalOrSeller("ANYONE@VYAPLATFORM.COM", internalOpts), true); // case-insensitive
 assert.equal(isInternalOrSeller("shopper@gmail.com", internalOpts), false);
 assert.equal(isInternalOrSeller(null, internalOpts), false);
 assert.equal(isInternalOrSeller("", internalOpts), false);
});

test("isInternalOrSeller: seller accounts excluded via injected set", () => {
 const sellerEmails = new Set(["kscarrone@gmail.com"]);
 assert.equal(isInternalOrSeller("KScarrone@gmail.com", { ...internalOpts, sellerEmails }), true);
 assert.equal(isInternalOrSeller("shopper@gmail.com", { ...internalOpts, sellerEmails }), false);
});

// ── markBursts ──────────────────────────────────────────────────────────────
const s = (n: number) => n * 1000; // seconds → ms helper

test("markBursts. Debounces rapid same user·product·type repeats", () => {
 const evs = [
 { userId: "u1", productId: 7, eventType: "view", tsMs: s(0) },
 { userId: "u1", productId: 7, eventType: "view", tsMs: s(2) }, // 2s later → dropped (<5s)
 { userId: "u1", productId: 7, eventType: "view", tsMs: s(3) }, // still <5s from last KEPT → dropped
 { userId: "u1", productId: 7, eventType: "view", tsMs: s(10) }, // 10s from last kept → kept
 ];
 assert.deepEqual(markBursts(evs, BURST), [true, false, false, true]);
});

test("markBursts. Caps per user·product·type per UTC day", () => {
 const evs = Array.from({ length: 5 }, (_, i) => ({
 userId: "u1",
 productId: 7,
 eventType: "view",
 tsMs: s(i * 60), // a minute apart → gap never the limiter
 }));
 const keep = markBursts(evs, { minGapSeconds: 5, maxPerUserProductPerDay: 3 });
 assert.deepEqual(keep, [true, true, true, false, false]);
});

test("markBursts. Different products / types / users never merge", () => {
 const evs = [
 { userId: "u1", productId: 7, eventType: "view", tsMs: s(0) },
 { userId: "u1", productId: 8, eventType: "view", tsMs: s(1) }, // diff product → kept
 { userId: "u1", productId: 7, eventType: "click", tsMs: s(1) }, // diff type → kept
 { userId: "u2", productId: 7, eventType: "view", tsMs: s(1) }, // diff user → kept
 ];
 assert.deepEqual(markBursts(evs, BURST), [true, true, true, true]);
});

test("markBursts. Anonymous (null user) events are always kept", () => {
 const evs = [
 { userId: null, productId: 7, eventType: "view", tsMs: s(0) },
 { userId: null, productId: 7, eventType: "view", tsMs: s(1) },
 { userId: null, productId: 7, eventType: "view", tsMs: s(2) },
 ];
 assert.deepEqual(markBursts(evs, { minGapSeconds: 5, maxPerUserProductPerDay: 1 }), [
 true,
 true,
 true,
 ]);
});

// ── partitionEvents (the combined pipeline + reason breakdown) ───────────────
function ev(p: Partial<FilterableEvent>): FilterableEvent {
 return {
 userId: "u1",
 productId: 7,
 eventType: "view",
 tsMs: s(0),
 userAgent: null,
 email: "shopper@gmail.com",
 ...p,
 };
}

test("partitionEvents. Drops bots, internal/seller, bursts; counts each reason", () => {
 const sellerEmails = new Set(["seller@store.com"]);
 const events: FilterableEvent[] = [
 ev({ tsMs: s(0) }), // keep (clean consumer)
 ev({ userAgent: "Googlebot/2.1", tsMs: s(100) }), // bot
 ev({ email: "helster@me.com", tsMs: s(200) }), // internal
 ev({ email: "seller@store.com", tsMs: s(300) }), // seller
 ev({ tsMs: s(1) }), // burst (1s after the first kept consumer view)
 ];
 const { kept, stats } = partitionEvents(events, { config: CONFIG, sellerEmails });
 assert.equal(stats.total, 5);
 assert.equal(stats.bot, 1);
 assert.equal(stats.internal, 2); // internal email + seller
 assert.equal(stats.burst, 1);
 assert.equal(stats.kept, 1);
 assert.equal(kept.length, 1);
 assert.equal(kept[0].tsMs, s(0));
});

test("partitionEvents. SkipBurst keeps simultaneous order line items", () => {
 // Two line items of the same order: same user, null product, same ts.
 const orderItems: FilterableEvent[] = [
 ev({ productId: null, eventType: "order_item", tsMs: s(0), email: "buyer@gmail.com" }),
 ev({ productId: null, eventType: "order_item", tsMs: s(0), email: "buyer@gmail.com" }),
 ];
 const withBurst = partitionEvents(orderItems, { config: CONFIG });
 assert.equal(withBurst.kept.length, 1); // burst collapses them: wrong for orders
 const skipped = partitionEvents(orderItems, { config: CONFIG, skipBurst: true });
 assert.equal(skipped.kept.length, 2); // both kept
 assert.equal(skipped.stats.burst, 0);
});
