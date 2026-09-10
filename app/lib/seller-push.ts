// A push to the seller's phone: a sale, a buyer message.
//
// Best-effort end to end and never throws — the sale or message that caused it has already
// happened, and a notification failure must not become a webhook retry. The words come from
// seller-push-core.ts; the gate is her preferences (notification-prefs-db.ts); the phones are the
// tokens the app registered (messages-db.ts). Dependencies are injectable so the gating is unit
// tested with fakes — nothing here is ever exercised against a real phone from a test.
//
// Where it is called from: the Stripe Connect webhook after createPaidOrder (a storefront sale)
// and market-sync after markSold (a sale on eBay/Depop that VYA learned of by polling), plus the
// two message paths. NOT from finalizeMarketSale — she is standing at the table when a Market
// Mode sale completes, and a buzz in her pocket for the thing she just did is noise. NOT from the
// manual cross-listing "mark sold" either, for the same reason: she pressed the button herself.

import { salePush, messagePush, offerPush, payoutPush, type SaleChannel, type MessageSource } from "./seller-push-core.ts";
import { pushEnabled, type NotificationPrefs, type PushEvent } from "./notification-prefs-core.ts";
import { getNotificationPrefs } from "./notification-prefs-db.ts";
import { getStorePushTokens } from "./messages-db.ts";
import { sendExpoPush, type PushPayload } from "./push.ts";

export type SellerPushDeps = {
 getPrefs: (storeSlug: string) => Promise<NotificationPrefs>;
 getTokens: (storeSlug: string) => Promise<string[]>;
 send: (tokens: string[], payload: PushPayload) => Promise<void>;
};

const live: SellerPushDeps = { getPrefs: getNotificationPrefs, getTokens: getStorePushTokens, send: sendExpoPush };

export type PushResult = { sent: true } | { sent: false; reason: "off" | "no-tokens" | "error" };

async function deliver(storeSlug: string, ev: PushEvent, payload: PushPayload, deps: SellerPushDeps): Promise<PushResult> {
 try {
  const prefs = await deps.getPrefs(storeSlug);
  if (!pushEnabled(prefs, ev)) return { sent: false, reason: "off" };
  const tokens = await deps.getTokens(storeSlug);
  if (tokens.length === 0) return { sent: false, reason: "no-tokens" };
  await deps.send(tokens, payload);
  return { sent: true };
 } catch {
  /* allow-swallow: a push is a courtesy; the event it reports has already happened */
  return { sent: false, reason: "error" };
 }
}

export function pushSellerSale(
 storeSlug: string,
 o: { itemTitle: string | null | undefined; amountCents: number; currency: string; channel: SaleChannel; orderId: string },
 deps: SellerPushDeps = live,
): Promise<PushResult> {
 return deliver(storeSlug, "sold", salePush(o), deps);
}

export function pushSellerMessage(
 storeSlug: string,
 o: { buyerName: string | null | undefined; itemTitle: string | null | undefined; message: string; conversationId: number | string; source: MessageSource },
 deps: SellerPushDeps = live,
): Promise<PushResult> {
 return deliver(storeSlug, "message", messagePush(o), deps);
}

export function pushSellerOffer(
 storeSlug: string,
 o: { buyerName: string | null | undefined; itemTitle: string | null | undefined; amountCents: number; currency: string; offerId: number | string },
 deps: SellerPushDeps = live,
): Promise<PushResult> {
 return deliver(storeSlug, "offer", offerPush(o), deps);
}

export function pushSellerPayout(
 storeSlug: string,
 o: { amountCents: number; currency: string; payoutId: number | string },
 deps: SellerPushDeps = live,
): Promise<PushResult> {
 return deliver(storeSlug, "payout", payoutPush(o), deps);
}
