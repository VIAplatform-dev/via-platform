// The words on a seller's lock screen.
//
// A sale and a buyer message are the two pushes that matter. Pure: this shapes the payload; the
// gating (her preferences), the tokens and the send live in seller-push.ts.

import type { PushPayload } from "./push";

/** Currencies VYA's pilot stores actually price in. Anything else falls back to its code, which is
 *  honest — inventing the wrong symbol misstates the amount. */
const SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

/** Thousands separators by hand, not `toLocaleString` — copied from mobile/lib/seller/home.ts so a
 *  push reads exactly the way the same amount reads on the phone's Home. */
function group(n: number): string {
 return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Minor units → whole units with a symbol. Whole units only: pennies on a lock screen cost a
 *  character everyone has to read past. */
export function formatMoney(cents: number, currency: string): string {
 const units = Math.round(cents / 100);
 const code = currency.toUpperCase();
 const symbol = SYMBOLS[code] ?? `${code} `;
 return `${units < 0 ? "-" : ""}${symbol}${group(Math.abs(units))}`;
}

export type SaleChannel = "storefront" | "ebay" | "depop" | "market";

const WHERE: Record<SaleChannel, string> = {
 storefront: "on your storefront",
 ebay: "on eBay",
 depop: "on Depop",
 market: "at the market",
};

export function salePush(o: { itemTitle: string | null | undefined; amountCents: number; currency: string; channel: SaleChannel; orderId: string }): PushPayload {
 const title = (o.itemTitle ?? "").trim();
 return {
  title: `Sold: ${title || "a piece"}`,
  body: `${formatMoney(o.amountCents, o.currency)} · ${WHERE[o.channel]}`,
  data: { type: "sold", orderId: o.orderId },
 };
}

export type MessageSource = "storefront" | "marketplace";

const PREVIEW = 140;

export function messagePush(o: { buyerName: string | null | undefined; itemTitle: string | null | undefined; message: string; conversationId: number | string; source: MessageSource }): PushPayload {
 const who = (o.buyerName ?? "").trim();
 const what = (o.itemTitle ?? "").trim();
 const title = what ? `${who || "A buyer"} asked about ${what}` : who ? `${who} messaged you` : "A buyer messaged you";
 const text = o.message.trim();
 return {
  title,
  body: text.length > PREVIEW ? `${text.slice(0, PREVIEW)}…` : text,
  data: { type: "store_message", source: o.source, conversationId: o.conversationId },
 };
}
