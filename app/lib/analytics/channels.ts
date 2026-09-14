/**
 * Where a sale came from. Pure.
 *
 * A seller's sales arrive through several doors and each door names itself differently: her own
 * storefront and her market stall are rows in `orders` with a `channel`; Depop, eBay and Vestiaire
 * are rows in `cross_listing_sales` with a `platform`; her pre-VYA history is `imported_orders` with
 * a `source`. Three words for one idea.
 *
 * ONE LABEL ON EVERY SALE. "Where did this come from" is the question a seller actually asks — is
 * Depop worth the 10%, is the market stall worth the Saturday — and it is the same question whether
 * the answer is Depop or her old Shopify. That is also why imported history needs no special
 * treatment in the dashboard: Shopify is not "an import", it is a channel she used to sell through.
 * It appears next to Depop, labelled, and the reader can draw their own conclusion.
 */

export type ChannelKey =
 | "storefront" | "in-person" | "depop" | "ebay" | "vestiaire" | "etsy" | "poshmark"
 | "shopify" | "square" | "imported" | "other";

const LABELS: Record<ChannelKey, string> = {
 storefront: "Your shop",
 "in-person": "In person",
 depop: "Depop",
 ebay: "eBay",
 vestiaire: "Vestiaire",
 etsy: "Etsy",
 poshmark: "Poshmark",
 shopify: "Shopify",
 square: "Square",
 imported: "Brought over",
 other: "Other",
};

/** What a seller reads. Unknown keys get their own name back rather than "Other" — a channel we
 *  added and forgot to label here should look like itself, not like a bug. */
export function channelLabel(key: string): string {
 const k = String(key || "").trim().toLowerCase();
 if (k in LABELS) return LABELS[k as ChannelKey];
 return k ? k.charAt(0).toUpperCase() + k.slice(1) : LABELS.other;
}

/** `orders.channel` — her storefront, or a sale rung up in person. */
export function fromOrderChannel(channel: string | null | undefined, tender?: string | null): ChannelKey {
 const c = String(channel || "").trim().toLowerCase();
 if (c === "market" || c === "pos" || c === "in-person") return "in-person";
 // A cash tender means somebody stood in front of her, whatever the channel column says — the two
 // disagreed on old rows written before `channel` existed.
 if (String(tender || "").toLowerCase() === "cash") return "in-person";
 if (c === "online" || c === "storefront" || c === "") return "storefront";
 return normalise(c);
}

/** `imported_orders.source` — the shop she was on before. */
export function fromImportSource(source: string | null | undefined): ChannelKey {
 const s = String(source || "").trim().toLowerCase();
 // "csv" and "" say only that it was a file; the honest label for that is that she brought it over.
 if (!s || s === "csv" || s === "file" || s === "spreadsheet" || s === "import") return "imported";
 return normalise(s);
}

/** `cross_listing_sales.platform` — a marketplace. */
export function fromPlatform(platform: string | null | undefined): ChannelKey {
 return normalise(String(platform || "").trim().toLowerCase());
}

function normalise(k: string): ChannelKey {
 if (k in LABELS) return k as ChannelKey;
 if (k.includes("vestiaire")) return "vestiaire";
 if (k.includes("depop")) return "depop";
 if (k.includes("ebay")) return "ebay";
 if (k.includes("shopify")) return "shopify";
 if (k.includes("square")) return "square";
 return "other";
}

export type ChannelTotal = { channel: ChannelKey; label: string; revenueCents: number; orders: number };

/** Revenue and orders per channel, biggest first — the answer to "is Depop worth it". */
export function rollUp(rows: { channel: ChannelKey; amountCents: number }[]): ChannelTotal[] {
 const by = new Map<ChannelKey, ChannelTotal>();
 for (const r of rows || []) {
  if (!r) continue;
  const cur = by.get(r.channel) ?? { channel: r.channel, label: channelLabel(r.channel), revenueCents: 0, orders: 0 };
  cur.revenueCents += Number(r.amountCents) || 0;
  cur.orders += 1;
  by.set(r.channel, cur);
 }
 return [...by.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.orders - a.orders);
}
