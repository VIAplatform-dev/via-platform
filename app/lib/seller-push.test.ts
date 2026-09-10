import { test } from "node:test";
import assert from "node:assert/strict";
import { pushSellerSale, pushSellerMessage, pushSellerOffer, pushSellerPayout, type SellerPushDeps } from "./seller-push.ts";
import { DEFAULT_PREFS, mergePrefs } from "./notification-prefs-core.ts";
import type { PushPayload } from "./push.ts";

// Delivery of a seller push, with every outside dependency faked: nothing here touches a
// database or Expo. What is tested is the GATE — her preferences, her tokens — and that a failure
// anywhere in the chain is swallowed, because a push must never break the sale that caused it.

function fakes(o: { prefs?: unknown; tokens?: string[]; getPrefs?: SellerPushDeps["getPrefs"]; getTokens?: SellerPushDeps["getTokens"]; send?: SellerPushDeps["send"] } = {}) {
 const sent: { tokens: string[]; payload: PushPayload }[] = [];
 const deps: SellerPushDeps = {
  getPrefs: o.getPrefs ?? (async () => (o.prefs ?? DEFAULT_PREFS) as never),
  getTokens: o.getTokens ?? (async () => o.tokens ?? ["ExponentPushToken[abc]"]),
  send: o.send ?? (async (tokens, payload) => { sent.push({ tokens, payload }); }),
 };
 return { deps, sent };
}

const SALE = { itemTitle: "Blumarine slip dress", amountCents: 18_000, currency: "GBP", channel: "storefront" as const, orderId: "o1" };
const MESSAGE = { buyerName: "Ana", itemTitle: "Coat", message: "Still available?", conversationId: 7, source: "storefront" as const };

test("a sale reaches every token the store registered, worded by the core", async () => {
 const { deps, sent } = fakes({ tokens: ["ExponentPushToken[a]", "ExponentPushToken[b]"] });
 const r = await pushSellerSale("blummier", SALE, deps);
 assert.deepEqual(r, { sent: true });
 assert.equal(sent.length, 1);
 assert.deepEqual(sent[0].tokens, ["ExponentPushToken[a]", "ExponentPushToken[b]"]);
 assert.equal(sent[0].payload.title, "Sold: Blumarine slip dress");
 assert.equal(sent[0].payload.body, "£180 · on your storefront");
 assert.deepEqual(sent[0].payload.data, { type: "sold", orderId: "o1" });
});

test("her preference is the gate: sold off means nothing is sent, and the tokens are not even read", async () => {
 let tokensRead = false;
 const { deps, sent } = fakes({ prefs: mergePrefs(DEFAULT_PREFS, { push: { sold: false } }), getTokens: async () => { tokensRead = true; return ["ExponentPushToken[a]"]; } });
 assert.deepEqual(await pushSellerSale("blummier", SALE, deps), { sent: false, reason: "off" });
 assert.equal(sent.length, 0);
 assert.equal(tokensRead, false);
});

test("a message is gated by the message preference, separately from sales", async () => {
 const off = fakes({ prefs: mergePrefs(DEFAULT_PREFS, { push: { message: false } }) });
 assert.deepEqual(await pushSellerMessage("blummier", MESSAGE, off.deps), { sent: false, reason: "off" });
 const on = fakes();
 assert.deepEqual(await pushSellerMessage("blummier", MESSAGE, on.deps), { sent: true });
 assert.equal(on.sent[0].payload.title, "Ana asked about Coat");
 assert.deepEqual(on.sent[0].payload.data, { type: "store_message", source: "storefront", conversationId: 7 });
});

test("no phone registered → nothing to send, and that is not an error", async () => {
 const { deps, sent } = fakes({ tokens: [] });
 assert.deepEqual(await pushSellerSale("blummier", SALE, deps), { sent: false, reason: "no-tokens" });
 assert.equal(sent.length, 0);
});

test("a failure anywhere is swallowed — the sale already happened", async () => {
 const prefsDown = fakes({ getPrefs: async () => { throw new Error("db down"); } });
 assert.deepEqual(await pushSellerSale("blummier", SALE, prefsDown.deps), { sent: false, reason: "error" });
 const sendDown = fakes({ send: async () => { throw new Error("expo down"); } });
 assert.deepEqual(await pushSellerMessage("blummier", MESSAGE, sendDown.deps), { sent: false, reason: "error" });
});

// ── the two events that had a switch and no sender ─────────────────────────────────────────────
// "An offer comes in" and "A payout lands" were toggles on the Notifications screen that nothing
// could ever satisfy: no code sent either push. These pin that they now go, and that they obey the
// same gate as the two that already worked.

test("an offer pushes, and says who and how much", async () => {
 const { deps, sent } = fakes({ prefs: mergePrefs(DEFAULT_PREFS, { push: { offer: true } }) });
 const r = await pushSellerOffer("s", { buyerName: "Ana", itemTitle: "Silk Slip Dress", amountCents: 18_000, currency: "usd", offerId: 7 }, deps);
 assert.deepEqual(r, { sent: true });
 assert.equal(sent[0].payload.title, "Offer on Silk Slip Dress");
 assert.match(sent[0].payload.body, /180/);
 assert.match(sent[0].payload.body, /Ana/);
 assert.equal(sent[0].payload.data?.type, "offer");
});

test("an offer with no name or piece still says something true", async () => {
 const { deps, sent } = fakes({ prefs: mergePrefs(DEFAULT_PREFS, { push: { offer: true } }) });
 await pushSellerOffer("s", { buyerName: null, itemTitle: null, amountCents: 5_000, currency: "usd", offerId: 1 }, deps);
 assert.equal(sent[0].payload.title, "You have an offer");
});

test("offers off means no offer push", async () => {
 const { deps, sent } = fakes({ prefs: mergePrefs(DEFAULT_PREFS, { push: { offer: false } }) });
 const r = await pushSellerOffer("s", { buyerName: "Ana", itemTitle: "A bag", amountCents: 100, currency: "usd", offerId: 1 }, deps);
 assert.deepEqual(r, { sent: false, reason: "off" });
 assert.equal(sent.length, 0);
});

test("a payout pushes when she asked to hear about it", async () => {
 const { deps, sent } = fakes({ prefs: mergePrefs(DEFAULT_PREFS, { push: { payout: true } }) });
 const r = await pushSellerPayout("s", { amountCents: 42_000, currency: "usd", payoutId: "po_1" }, deps);
 assert.deepEqual(r, { sent: true });
 assert.equal(sent[0].payload.title, "Payout on its way");
 assert.equal(sent[0].payload.data?.type, "payout");
});

test("payout is off by default — money moving is not urgent enough to buzz unasked", async () => {
 const { deps } = fakes();
 assert.deepEqual(await pushSellerPayout("s", { amountCents: 1, currency: "usd", payoutId: "po" }, deps), { sent: false, reason: "off" });
});

test("a push failure never escapes — the payout already happened", async () => {
 const { deps } = fakes({ prefs: mergePrefs(DEFAULT_PREFS, { push: { payout: true } }), send: async () => { throw new Error("expo down"); } });
 assert.deepEqual(await pushSellerPayout("s", { amountCents: 1, currency: "usd", payoutId: "po" }, deps), { sent: false, reason: "error" });
});
