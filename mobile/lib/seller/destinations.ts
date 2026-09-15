// The places in the portal, as things you can search for.
//
// /api/store/search looks up DATA. A piece, an order, a customer, a discount code. It has no idea
// the app has screens. So typing "consignment" on Home, with a Consignment tile visible two inches
// below the box, answered "Nothing matches 'consignment'". A search that cannot find the thing on
// the screen behind it reads as broken.
//
// This is the other half: a small local index of destinations, matched on the phone with no
// request, merged above the data hits. Local because it must answer instantly and must answer
// offline: the whole point is that it is faster than remembering which drawer a setting lives in.
//
// KEYWORDS ARE THE WORDS SHE WOULD ACTUALLY TYPE, not the words we named the screen. Nobody
// searches "policy"; they search "returns" or "refunds". Nobody searches "domain"; they search
// "website address" or "url". Every synonym here is one someone would say out loud in a shop.

export type Destination = {
  /** What the row says. */
  label: string;
  /** The line underneath: what you will find there. */
  sub: string;
  /** An expo-router path. */
  href: string;
  /** Extra terms that should find it, beyond the words already in `label`. */
  keywords: string[];
};

export const DESTINATIONS: Destination[] = [
  { label: "Inventory", href: "/(seller)/inventory", sub: "Every piece, live and held", keywords: ["stock", "pieces", "items", "catalogue", "catalog", "listings"] },
  { label: "List a piece", href: "/(seller)/list", sub: "Photograph it and put it up", keywords: ["new", "add", "create", "upload", "post", "sell"] },
  { label: "Consignment", href: "/(seller)/consignment", sub: "What you owe, and to whom", keywords: ["consign", "consignor", "consignors", "split", "splits", "owed", "payout to consignor"] },
  { label: "Consignors", href: "/(seller)/consignors", sub: "The people who leave you pieces", keywords: ["consign", "consignment", "suppliers", "sellers"] },
  { label: "Orders", href: "/(seller)/orders", sub: "Sold, packed and on the way", keywords: ["sales", "sold", "ship", "shipping", "packing", "fulfilment", "fulfillment"] },
  { label: "Inbox", href: "/(seller)/inbox", sub: "Messages, offers and enquiries", keywords: ["messages", "offers", "enquiries", "inquiries", "chat", "dm"] },
  { label: "Storefront", href: "/(seller)/store", sub: "How your shop looks", keywords: ["site", "website", "shop", "theme", "design", "homepage"] },
  { label: "Payouts", href: "/(seller)/payouts", sub: "Stripe, your bank, and what is on the way", keywords: ["stripe", "bank", "money", "paid", "get paid", "balance", "deposits"] },
  { label: "Billing", href: "/(seller)/billing", sub: "Your VYA plan and invoices", keywords: ["subscription", "plan", "invoice", "invoices", "card", "receipt"] },
  { label: "Discounts", href: "/(seller)/discounts", sub: "Codes and what they take off", keywords: ["codes", "promo", "coupon", "sale", "percent off", "voucher"] },
  { label: "Customers", href: "/(seller)/customers", sub: "Who bought what", keywords: ["clients", "buyers", "shoppers", "people"] },
  { label: "Analytics", href: "/(seller)/analytics", sub: "Views, sales and what is moving", keywords: ["stats", "numbers", "reports", "insights", "traffic", "revenue"] },
  { label: "Shipping", href: "/(seller)/shipping", sub: "Where you ship from, and what you charge", keywords: ["postage", "labels", "rates", "delivery", "collection", "pickup"] },
  { label: "Tax", href: "/(seller)/tax", sub: "What you collect and where", keywords: ["vat", "sales tax", "nexus", "gst"] },
  { label: "Returns policy", href: "/(seller)/policy", sub: "What a buyer can send back", keywords: ["returns", "refunds", "refund", "exchange", "policy"] },
  { label: "Your domain", href: "/(seller)/domain", sub: "Use your own web address", keywords: ["url", "web address", "website address", "dns", "custom domain", "link"] },
  { label: "Rentals", href: "/(seller)/rentals", sub: "What is out and what is due back", keywords: ["rent", "renting", "hire", "loan", "borrowed", "due back"] },
  { label: "Appointments", href: "/(seller)/appointments", sub: "Who is coming in, and when", keywords: ["bookings", "booking", "calendar", "diary", "visits", "fittings"] },
  { label: "Notifications", href: "/(seller)/notifications", sub: "What needs you", keywords: ["alerts", "updates"] },
  { label: "Notification settings", href: "/(seller)/notification-settings", sub: "Turn buzzing on and off", keywords: ["push", "email", "alerts off", "mute", "turn off"] },
  { label: "Market Mode", href: "/market", sub: "Sell in person, off the phone", keywords: ["in person", "pop up", "popup", "market", "fair", "card reader", "till", "pos", "counter"] },
  { label: "Help", href: "/(seller)/help", sub: "How things work, and how to reach us", keywords: ["support", "contact", "faq", "question"] },
  // Cross-listing has no screen of its own: it is a field on each piece ("Also list on"), because
  // it is a decision per piece rather than a place you go. Searching for it should still land
  // somewhere useful, and say what to do next rather than pretending a page exists.
  { label: "Cross-listing", href: "/(seller)/inventory", sub: "Open a piece, then “Also list on”", keywords: ["crosslist", "cross list", "crosslisting", "cross posting", "crosspost", "ebay", "depop", "vestiaire", "other marketplaces"] },
];

/** Normalised for comparison: lowercase, and hyphens/underscores read as spaces so "cross-list",
 *  "cross list" and "crosslist" all reach the same row. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The same string with spaces removed, so "crosslisting" matches "cross listing". */
function squash(s: string): string {
  return norm(s).replace(/ /g, "");
}

function score(d: Destination, q: string): number {
  const nq = norm(q);
  const sq = squash(q);
  if (!nq) return 0;
  const label = norm(d.label);
  const slabel = squash(d.label);

  if (label === nq) return 100;
  if (label.startsWith(nq)) return 80;
  // A word inside the label: "policy" finds "Returns policy".
  if (label.split(" ").some((w) => w.startsWith(nq))) return 70;
  if (slabel.includes(sq)) return 60;

  for (const kw of d.keywords) {
    const k = norm(kw);
    if (k === nq) return 55;
    if (k.startsWith(nq)) return 45;
    if (squash(kw).includes(sq)) return 35;
  }
  return 0;
}

/**
 * Destinations matching a query, best first.
 *
 * Two characters minimum: one letter matches most of the list and would put a wall of screens
 * above the piece she is actually looking for.
 */
export function matchDestinations(q: string, limit = 4): Destination[] {
  if (norm(q).length < 2) return [];
  return DESTINATIONS
    .map((d) => ({ d, s: score(d, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.d.label.localeCompare(b.d.label))
    .slice(0, limit)
    .map((x) => x.d);
}
