import { test } from "node:test";
import assert from "node:assert/strict";
import { pushSellerSale, pushSellerMessage, type SellerPushDeps } from "./seller-push.ts";
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
