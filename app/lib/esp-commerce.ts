// ───────────────────────────────────────────────────────────────────────────
// VYA as a CONNECTED STORE in Mailchimp — the thing that puts us on their
// "Connect your store" screen beside Shopify, Wix and WooCommerce.
//
// Syncing contacts makes a mailing list. Syncing a STORE is a different object: Mailchimp builds
// abandoned-cart and product-retargeting automations, purchase-behaviour segments and revenue
// reporting on top of `/ecommerce/stores`, and none of that lights up for a store connected only as
// contacts. It's also the qualifying feature for their Integration Partner Program, which is what
// the directory listing actually is.
//
// Shapes are theirs, not ours, so this file exists to translate once and be tested:
//  · money is a NUMBER in their JSON, not cents and not a string
//  · every object carries an `id` WE choose, and they upsert on it — so ids must be stable across
//    syncs or every run creates duplicates
//  · a cart with a `customer` that has no `email_address` is rejected, which is the usual reason an
//    abandoned-cart sync silently does nothing
//
// Pure. The calls live in esp-client.ts.
// ───────────────────────────────────────────────────────────────────────────

const money = (cents: number | null | undefined) => Number((((cents ?? 0) as number) / 100).toFixed(2));

/** Their ids allow letters, numbers, dashes and underscores. A slug with anything else breaks the URL. */
export function storeId(storeSlug: string): string {
 return `vya-${String(storeSlug || "store").toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40)}`;
}

export type StoreInfo = {
 slug: string; name: string; currency?: string | null; domain?: string | null; email?: string | null; listId: string;
};

export function mailchimpStore(s: StoreInfo) {
 return {
  id: storeId(s.slug),
  list_id: s.listId,
  name: s.name || s.slug,
  // They reject a store whose currency isn't three letters, and default to USD rather than refusing.
  currency_code: (s.currency || "USD").toUpperCase().slice(0, 3),
  // How VYA appears on the store's own integrations page in Mailchimp.
  platform: "VYA",
  ...(s.domain ? { domain: s.domain } : {}),
  ...(s.email ? { email_address: s.email } : {}),
 };
}

export type CommerceCustomer = { email: string; name?: string | null; orders?: number; spentCents?: number; subscribed: boolean };

/** Their customer id must be stable, so it's the lowercased email — the only thing that never changes. */
export function customerId(email: string): string {
 return String(email || "").trim().toLowerCase().replace(/[^a-z0-9_.@-]/g, "-").slice(0, 60);
}

export function mailchimpCustomer(c: CommerceCustomer) {
 const parts = String(c.name || "").trim().split(/\s+/).filter(Boolean);
 return {
  id: customerId(c.email),
  email_address: c.email.trim().toLowerCase(),
  // Their word for "may we market to them". Passing the store's own consent means an unsubscribe on
  // VYA stops Mailchimp's automations too, rather than only stopping OUR sends.
  opt_in_status: c.subscribed,
  ...(parts[0] ? { first_name: parts[0] } : {}),
  ...(parts.length > 1 ? { last_name: parts.slice(1).join(" ") } : {}),
  orders_count: c.orders ?? 0,
  total_spent: money(c.spentCents),
 };
}

export type CommerceProduct = {
 id: string; title: string; url?: string | null; image?: string | null;
 priceCents: number; sku?: string | null; description?: string | null; inStock?: boolean;
};

/**
 * A piece.
 *
 * Vintage is one-of-one, so each product gets exactly one variant with the same id — their model
 * requires at least one variant, and inventing sizes we don't have would put fictional options into
 * a store's product-retargeting emails.
 */
export function mailchimpProduct(p: CommerceProduct) {
 return {
  id: String(p.id),
  title: p.title || "Untitled",
  ...(p.url ? { url: p.url } : {}),
  ...(p.image ? { image_url: p.image } : {}),
  ...(p.description ? { description: p.description.slice(0, 1000) } : {}),
  variants: [{
   id: String(p.id),
   title: p.title || "Untitled",
   ...(p.sku ? { sku: p.sku } : {}),
   price: money(p.priceCents),
   // One of one: sold means none left, and their retargeting shouldn't push a piece that's gone.
   inventory_quantity: p.inStock === false ? 0 : 1,
  }],
 };
}

export type CommerceLine = { id: string; productId: string; priceCents: number; quantity?: number };
export type CommerceOrder = {
 id: string; customer: CommerceCustomer; totalCents: number; currency?: string | null;
 placedAt?: string | null; lines: CommerceLine[];
};

export function mailchimpOrder(o: CommerceOrder) {
 return {
  id: String(o.id),
  customer: mailchimpCustomer(o.customer),
  currency_code: (o.currency || "USD").toUpperCase().slice(0, 3),
  order_total: money(o.totalCents),
  ...(o.placedAt ? { processed_at_foreign: o.placedAt } : {}),
  lines: o.lines.map((l) => ({
   id: String(l.id),
   product_id: String(l.productId),
   product_variant_id: String(l.productId),
   quantity: l.quantity ?? 1,
   price: money(l.priceCents),
  })),
 };
}

/** An abandoned basket. This is what makes Mailchimp's recovery automations fire. */
export function mailchimpCart(c: CommerceOrder) {
 return {
  id: String(c.id),
  customer: mailchimpCustomer(c.customer),
  currency_code: (c.currency || "USD").toUpperCase().slice(0, 3),
  order_total: money(c.totalCents),
  lines: c.lines.map((l) => ({
   id: String(l.id),
   product_id: String(l.productId),
   product_variant_id: String(l.productId),
   quantity: l.quantity ?? 1,
   price: money(l.priceCents),
  })),
 };
}

/** A cart or order with no usable email is refused by them — check here rather than at the API. */
export function commerceReady(c: CommerceOrder): boolean {
 return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c.customer?.email || "").trim()) && c.lines.length > 0;
}
