// VYA inventory, rendered in Shopify's cart JSON shape.
//
// This is the whole trick behind Plan B. Every Shopify theme publishes its route table into the page
// as RELATIVE paths:
//
//   routes = { cart_add_url: '/cart/add', cart_change_url: '/cart/change',
//              cart_update_url: '/cart/update', cart_url: '/cart',
//              predictive_search_url: '/search/suggest' }
//
// A relative path resolves against whatever origin served the page — so when we serve the seller's
// captured theme from a VYA-controlled origin, the theme's own JavaScript sends its cart calls TO US.
// Answer them in the shape the theme expects and the seller's real cart drawer, quantity steppers and
// quick-add buttons drive VYA's database, with no code of ours in the page at all.
//
// One implementation covers all 13 Shopify stores in the corpus and every future Shopify seller,
// which is why this is worth doing properly rather than per-theme.
//
// Pure — no database, no network. The routes fetch items and hand them here.

/** A VYA item, in the fields this module needs. */
export type CartLineItem = {
 id: string;
 title: string;
 priceCents: number;
 currency: string;
 image: string | null;
 handle?: string | null;
 /** The source platform's variant id, stored at import. This is the bridge: the theme's Add-to-cart
  *  posts a Shopify variant id, which maps straight back to a VYA item. */
 sourceVariantId?: string | null;
 available?: boolean;
};

/** One line in Shopify's cart JSON. Themes read these field names directly. */
export type ShopifyCartLine = {
 id: number | string;
 key: string;
 title: string;
 product_title: string;
 variant_title: string | null;
 quantity: number;
 /** Shopify money is an INTEGER IN MINOR UNITS (cents) — never a formatted string. Themes divide by
  *  100 themselves, so returning "24.95" here renders as £0.25. */
 price: number;
 original_price: number;
 line_price: number;
 original_line_price: number;
 final_price: number;
 final_line_price: number;
 discounted_price: number;
 total_discount: number;
 image: string | null;
 featured_image: { url: string | null; alt: string | null };
 url: string;
 handle: string;
 product_id: number | string;
 variant_id: number | string;
 sku: string | null;
 vendor: string | null;
 requires_shipping: boolean;
 product_has_only_default_variant: boolean;
 options_with_values: { name: string; value: string }[];
 properties: Record<string, string> | null;
 discounts: unknown[];
 line_level_discount_allocations: unknown[];
 selling_plan_allocation: null;
};

export type ShopifyCart = {
 token: string;
 note: string | null;
 attributes: Record<string, string>;
 original_total_price: number;
 total_price: number;
 total_discount: number;
 total_weight: number;
 item_count: number;
 items: ShopifyCartLine[];
 requires_shipping: boolean;
 currency: string;
 items_subtotal_price: number;
 cart_level_discount_applications: unknown[];
};

/** Every VYA item is one-of-one, so a cart line is always quantity 1. */
const QTY = 1;

export function toCartLine(item: CartLineItem): ShopifyCartLine {
 const handle = item.handle || item.sourceVariantId || item.id;
 const price = item.priceCents;
 // `key` is what the theme sends back to /cart/change to identify a line. Shopify's format is
 // "{variant_id}:{hash}"; themes treat it as opaque, so the VYA item id is a valid — and stable —
 // choice, and it means a change/remove call needs no lookup table.
 return {
  id: item.id,
  key: item.id,
  title: item.title,
  product_title: item.title,
  variant_title: null,
  quantity: QTY,
  price,
  original_price: price,
  line_price: price * QTY,
  original_line_price: price * QTY,
  final_price: price,
  final_line_price: price * QTY,
  discounted_price: price,
  total_discount: 0,
  image: item.image,
  featured_image: { url: item.image, alt: item.title },
  url: `/products/${handle}`,
  handle: String(handle),
  product_id: item.id,
  variant_id: item.sourceVariantId || item.id,
  sku: null,
  vendor: null,
  requires_shipping: true,
  // One-of-one vintage has no size/colour run, so themes must not render a variant picker or a
  // quantity stepper that could ask for two of something that exists once.
  product_has_only_default_variant: true,
  options_with_values: [],
  properties: null,
  discounts: [],
  line_level_discount_allocations: [],
  selling_plan_allocation: null,
 };
}

export function buildCart(items: CartLineItem[], token: string): ShopifyCart {
 const lines = items.map(toCartLine);
 const total = lines.reduce((s, l) => s + l.final_line_price, 0);
 return {
  token,
  note: null,
  attributes: {},
  original_total_price: total,
  total_price: total,
  total_discount: 0,
  total_weight: 0,
  item_count: lines.length,
  items: lines,
  requires_shipping: lines.length > 0,
  // Currency comes from the items themselves (imported alongside the price), never a guess.
  currency: items[0]?.currency || "USD",
  items_subtotal_price: total,
  cart_level_discount_applications: [],
 };
}

/**
 * Read the variant id out of an Add-to-cart request, whichever way the theme sent it.
 *
 * Themes are inconsistent here and all three forms are common in the corpus: a classic form POST
 * (`id=123&quantity=1`), a JSON body (`{id: 123}`), and the bulk shape (`{items: [{id: 123}]}`).
 * Missing any of them looks, from the shopper's side, like a dead Add-to-cart button.
 */
export function variantIdFromAddBody(body: unknown): string | null {
 if (!body || typeof body !== "object") return null;
 const b = body as Record<string, unknown>;
 const first = Array.isArray(b.items) && b.items.length ? (b.items[0] as Record<string, unknown>) : null;
 const raw = first?.id ?? b.id ?? b.variant_id ?? null;
 if (raw == null) return null;
 const s = String(raw).trim();
 return s ? s : null;
}

/** Shopify's error shape for "that variant can't be added" — themes render `description`. */
export function cartError(message: string, status = 422) {
 return {
  status,
  body: { status, message: "Cart Error", description: message },
 };
}

/** Predictive-search response shape (`/search/suggest.json`). */
export function buildSuggest(query: string, items: CartLineItem[]) {
 return {
  resources: {
   results: {
    products: items.map((i) => ({
     id: i.id,
     title: i.title,
     handle: i.handle || i.id,
     url: `/products/${i.handle || i.id}`,
     image: i.image,
     featured_image: { url: i.image },
     price: i.priceCents,
     available: i.available !== false,
    })),
   },
  },
  query,
 };
}
