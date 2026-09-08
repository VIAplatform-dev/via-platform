import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyParcelPosted, type ParcelNotifyDeps } from "./parcel-notify.ts";

const order = (id: string, p: Partial<{ trackingNumber: string | null; trackingUrl: string | null; trackingEmailSentAt: string | null; itemTitle: string | null; buyerEmail: string | null }> = {}) => ({
 id, status: "shipped", itemTitle: p.itemTitle ?? `Piece ${id}`, buyerEmail: p.buyerEmail === undefined ? "ana@example.com" : p.buyerEmail,
 trackingNumber: p.trackingNumber ?? null, trackingUrl: p.trackingUrl ?? null, trackingEmailSentAt: p.trackingEmailSentAt ?? null,
});

function fakes() {
 const sent: unknown[] = [];
 const marked: string[][] = [];
 const deps: ParcelNotifyDeps = {
  send: async (p) => { sent.push(p); },
  markSent: async (ids) => { marked.push(ids); },
 };
 return { deps, sent, marked };
}

test("a three-piece parcel gets ONE email, listing every piece, and every order is marked told", async () => {
 const { deps, sent, marked } = fakes();
 const r = await notifyParcelPosted({ storeSlug: "s", storeName: "Sourced", replyTo: "her@example.com", orders: [order("a", { trackingNumber: "TRK1", trackingUrl: "https://t/1" }), order("b"), order("c")] }, deps);
 assert.equal(r.sent, true);
 assert.equal(sent.length, 1);
 const p = sent[0] as { itemTitle: string; itemTitles: string[]; trackingNumber: string; trackingUrl: string | null; orderId: string; buyerEmail: string };
 assert.deepEqual(p.itemTitles, ["Piece a", "Piece b", "Piece c"]);
 assert.equal(p.itemTitle, "Piece a");
 assert.equal(p.trackingNumber, "TRK1");
 assert.equal(p.trackingUrl, "https://t/1");
 assert.equal(p.orderId, "a");
 assert.equal(p.buyerEmail, "ana@example.com");
 assert.deepEqual(marked, [["a", "b", "c"]]);
});

test("once any piece of the bag has been told, nothing more is sent — the per-order button and the parcel button agree", async () => {
 const { deps, sent, marked } = fakes();
 const r = await notifyParcelPosted({ storeSlug: "s", storeName: "Sourced", replyTo: null, orders: [order("a", { trackingNumber: "TRK1", trackingEmailSentAt: "2026-09-07T10:00:00Z" }), order("b")] }, deps);
 assert.deepEqual(r, { sent: false, reason: "already-sent" });
 assert.equal(sent.length, 0);
 assert.equal(marked.length, 0);
});

test("no tracking number, or no buyer email, means nothing to send", async () => {
 const { deps, sent } = fakes();
 assert.deepEqual(await notifyParcelPosted({ storeSlug: "s", storeName: "Sourced", replyTo: null, orders: [order("a"), order("b")] }, deps), { sent: false, reason: "no-tracking" });
 assert.deepEqual(await notifyParcelPosted({ storeSlug: "s", storeName: "Sourced", replyTo: null, orders: [order("a", { trackingNumber: "TRK1", buyerEmail: null })] }, deps), { sent: false, reason: "no-buyer-email" });
 assert.equal(sent.length, 0);
});

test("a failed send is reported, and the orders are NOT marked told so a retry can send", async () => {
 const { deps, marked } = fakes();
 deps.send = async () => { throw new Error("resend down"); };
 const r = await notifyParcelPosted({ storeSlug: "s", storeName: "Sourced", replyTo: null, orders: [order("a", { trackingNumber: "TRK1" })] }, deps);
 assert.deepEqual(r, { sent: false, reason: "send-failed", error: "resend down" });
 assert.equal(marked.length, 0);
});
