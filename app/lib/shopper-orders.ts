/**
 * What a shopper is allowed to see of her own orders at one store.
 *
 * The account panel is served into a public page, so everything this module returns is public. The
 * seller's economics — VYA's fee, what the piece cost her, the address book — stay on the server;
 * only what the shopper already knows (what she bought, what she paid, where it is) comes back.
 *
 * Matching happens in SQL, on the signed-in email and nothing else — see listOrdersForShopper. A
 * name or an item in common must never be enough to show one shopper another shopper's order.
 */

export type OrderRowForShopper = {
 id: string;
 orderNo: number;
 itemTitle: string | null;
 amountCents: number;
 currency: string;
 status: string;
 buyerEmail: string | null;
 createdAt: Date | null;
 trackingNumber?: string | null;
 trackingUrl?: string | null;
};

export type ShopperOrder = {
 id: string;
 orderNo: number;
 title: string;
 total: string;
 status: string;
 placedAt: string | null;
 tracking: { number: string; url: string | null } | null;
};

const SYMBOL: Record<string, string> = { usd: "$", gbp: "£", eur: "€", cad: "CA$", aud: "A$", jpy: "¥" };

/** Words a shopper would use. An unrecognised status still reads as words, never as a raw enum. */
const SAID: Record<string, string> = {
 paid: "Paid",
 pending: "Pending",
 shipped: "On its way",
 delivered: "Delivered",
 refunded: "Refunded",
 cancelled: "Cancelled",
 canceled: "Cancelled",
 return_requested: "Return requested",
 return_approved: "Return approved",
 returned: "Returned",
};

function money(cents: number, currency: string): string {
 const code = (currency || "usd").toLowerCase();
 const sym = SYMBOL[code] ?? "";
 const n = (cents || 0) / 100;
 const body = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 return sym ? `${sym}${body}` : `${body} ${code.toUpperCase()}`;
}

function saidAs(status: string): string {
 const key = (status || "").trim().toLowerCase();
 if (SAID[key]) return SAID[key];
 const words = key.replace(/[_-]+/g, " ").trim();
 return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Placed";
}

/** The public shape. Anything not built here is not sent. */
export function shopperOrderView(rows: OrderRowForShopper[]): ShopperOrder[] {
 return rows.map((r) => ({
  id: r.id,
  orderNo: r.orderNo,
  // A piece can be delisted or deleted after it sells; the order still happened.
  title: (r.itemTitle || "").trim() || "Item no longer listed",
  total: money(r.amountCents, r.currency),
  status: saidAs(r.status),
  placedAt: r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null,
  tracking: r.trackingNumber ? { number: r.trackingNumber, url: r.trackingUrl ?? null } : null,
 }));
}
