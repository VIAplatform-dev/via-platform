import { and, desc, eq, isNull, inArray, sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { getDb, orders, payouts, items, sellers } from "./index";
import type { Order } from "./index";

// Raw client for the additive refund/return columns that aren't in the drizzle schema yet
// (tagged-template queries return a plain rows array, no execute-shape ambiguity).
function rawSql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export type SellerOrderRow = {
 id: string;
 orderNo: number; // per-store sequence by creation order (1 = the store's first order)
 itemId: string | null;
 itemTitle: string | null;
 amountCents: number;
 feeCents: number | null;
 shippingPaidCents: number | null;
 costCents: number | null; // the seller's cost for the item (COGS), from the joined item
 currency: string;
 buyerEmail: string | null;
 status: string;
 paidAt: Date | null;
 createdAt: Date | null;
};

/** A seller's orders (most recent first), with the item title joined in. */
export async function listSellerOrders(sellerId: string): Promise<SellerOrderRow[]> {
 const db = getDb();
 return db
 .select({
 id: orders.id,
 // Sequential per-store order number by creation order. The window sees every row matching the
 // WHERE (all of this seller's orders) before ORDER BY/LIMIT, so recent orders keep their true #.
 orderNo: sql<number>`row_number() over (order by ${orders.createdAt} asc, ${orders.id} asc)`.mapWith(Number),
 itemId: orders.itemId,
 itemTitle: items.title,
 amountCents: orders.amountCents,
 feeCents: orders.feeCents,
 shippingPaidCents: orders.shippingPaidCents,
 costCents: items.costCents,
 currency: orders.currency,
 buyerEmail: orders.buyerEmail,
 status: orders.status,
 paidAt: orders.paidAt,
 createdAt: orders.createdAt,
 })
 .from(orders)
 .leftJoin(items, eq(items.id, orders.itemId))
 .where(eq(orders.sellerId, sellerId))
 .orderBy(desc(orders.createdAt))
 .limit(200);
}

/**
 * One shopper's orders at one store, for her own account panel.
 *
 * Scoped by seller AND email in SQL rather than filtered afterwards: the row must never leave the
 * database if it isn't hers. Only the columns a shopper may see are selected — see shopper-orders.ts.
 */
export async function listOrdersForShopper(sellerId: string, email: string) {
 const key = (email || "").trim().toLowerCase();
 if (!sellerId || !key.includes("@")) return [];
 const db = getDb();
 return db
 .select({
 id: orders.id,
 orderNo: sql<number>`row_number() over (order by ${orders.createdAt} asc, ${orders.id} asc)`.mapWith(Number),
 itemTitle: items.title,
 amountCents: orders.amountCents,
 currency: orders.currency,
 status: orders.status,
 buyerEmail: orders.buyerEmail,
 createdAt: orders.createdAt,
 trackingNumber: orders.trackingNumber,
 trackingUrl: orders.trackingUrl,
 })
 .from(orders)
 .leftJoin(items, eq(items.id, orders.itemId))
 .where(and(eq(orders.sellerId, sellerId), sql`lower(trim(${orders.buyerEmail})) = ${key}`))
 .orderBy(desc(orders.createdAt))
 .limit(100);
}

// Order + payout records. With direct charges the money settles to the seller's
// own account automatically (seller is merchant of record); these rows are VYA's
// record of the sale + the seller's net.

export async function createPaidOrder(o: {
 itemId: string;
 sellerId: string;
 buyerEmail: string | null;
 buyerName?: string | null;
 buyerPhone?: string | null;
 ship?: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal?: string | null; country?: string | null } | null;
 amountCents: number;
 feeCents?: number | null;
 shippingPaidCents?: number | null;
 currency: string;
 stripePaymentIntent: string | null;
}): Promise<Order> {
 const db = getDb();
 const [row] = await db
 .insert(orders)
 .values({
 itemId: o.itemId,
 sellerId: o.sellerId,
 buyerEmail: o.buyerEmail,
 buyerName: o.buyerName ?? null,
 buyerPhone: o.buyerPhone ?? null,
 shipLine1: o.ship?.line1 ?? null,
 shipLine2: o.ship?.line2 ?? null,
 shipCity: o.ship?.city ?? null,
 shipState: o.ship?.state ?? null,
 shipPostal: o.ship?.postal ?? null,
 shipCountry: o.ship?.country ?? null,
 amountCents: o.amountCents,
 feeCents: o.feeCents ?? null,
 shippingPaidCents: o.shippingPaidCents ?? null,
 currency: o.currency,
 stripePaymentIntent: o.stripePaymentIntent,
 status: "paid",
 paidAt: new Date(),
 })
 .returning();
 return row;
}

// Orders of a payment that still need their confirmation emails (idempotent: a
// retried webhook only picks up orders whose confirmation_sent_at is still null).
export async function getOrdersNeedingConfirmation(pi: string) {
 const db = getDb();
 return db
 .select({
 id: orders.id,
 amountCents: orders.amountCents,
 feeCents: orders.feeCents,
 currency: orders.currency,
 buyerEmail: orders.buyerEmail,
 buyerName: orders.buyerName,
 shipLine1: orders.shipLine1, shipLine2: orders.shipLine2, shipCity: orders.shipCity,
 shipState: orders.shipState, shipPostal: orders.shipPostal, shipCountry: orders.shipCountry,
 itemTitle: items.title,
 itemImages: items.images,
 sellerName: sellers.name,
 sellerSlug: sellers.slug,
 sellerEmail: sellers.email,
 })
 .from(orders)
 .leftJoin(items, eq(items.id, orders.itemId))
 .leftJoin(sellers, eq(sellers.id, orders.sellerId))
 .where(and(eq(orders.stripePaymentIntent, pi), isNull(orders.confirmationSentAt)));
}

export async function markConfirmationSent(orderId: string): Promise<void> {
 await getDb().update(orders).set({ confirmationSentAt: new Date() }).where(eq(orders.id, orderId));
}

/** Undo a confirmation claim so a failed send retries on the next webhook event. */
export async function resetConfirmationSent(orderId: string): Promise<void> {
 await getDb().update(orders).set({ confirmationSentAt: null }).where(eq(orders.id, orderId));
}

/**
 * ATOMICALLY claim a PaymentIntent's orders for confirmation, then return their details. The claim
 * (a single UPDATE ... WHERE sent IS NULL ... RETURNING) is the race gate: when checkout.session.
 * completed and payment_intent.succeeded fire at once, only ONE of them wins each order, so the buyer
 * never gets a duplicate confirmation. Replaces the old check-then-mark, which raced.
 */
export async function claimOrdersForConfirmation(pi: string) {
 const db = getDb();
 const claimed = await db.update(orders)
 .set({ confirmationSentAt: new Date() })
 .where(and(eq(orders.stripePaymentIntent, pi), isNull(orders.confirmationSentAt)))
 .returning({ id: orders.id });
 if (!claimed.length) return [] as Awaited<ReturnType<typeof detailsForOrders>>;
 return detailsForOrders(claimed.map((r) => r.id));
}

async function detailsForOrders(ids: string[]) {
 const db = getDb();
 return db
 .select({
 id: orders.id,
 amountCents: orders.amountCents,
 feeCents: orders.feeCents,
 shippingPaidCents: orders.shippingPaidCents,
 currency: orders.currency,
 buyerEmail: orders.buyerEmail,
 buyerName: orders.buyerName,
 shipLine1: orders.shipLine1, shipLine2: orders.shipLine2, shipCity: orders.shipCity,
 shipState: orders.shipState, shipPostal: orders.shipPostal, shipCountry: orders.shipCountry,
 itemTitle: items.title,
 itemImages: items.images,
 sellerName: sellers.name,
 sellerSlug: sellers.slug,
 sellerEmail: sellers.email,
 })
 .from(orders)
 .leftJoin(items, eq(items.id, orders.itemId))
 .leftJoin(sellers, eq(sellers.id, orders.sellerId))
 .where(inArray(orders.id, ids));
}

/** Full order for the seller fulfillment view (item joined in). */
export async function getOrderDetail(orderId: string) {
 const db = getDb();
 const rows = await db
 .select({
 id: orders.id, status: orders.status, sellerId: orders.sellerId, itemId: orders.itemId,
 // Same per-store sequence as the list, computed for this single order via a correlated count.
 orderNo: sql<number>`(select count(*) from ${orders} o2 where o2.seller_id = ${orders.sellerId} and (o2.created_at < ${orders.createdAt} or (o2.created_at = ${orders.createdAt} and o2.id <= ${orders.id})))`.mapWith(Number),
 stripePaymentIntent: orders.stripePaymentIntent,
 amountCents: orders.amountCents, feeCents: orders.feeCents, shippingPaidCents: orders.shippingPaidCents, currency: orders.currency,
 buyerEmail: orders.buyerEmail, buyerName: orders.buyerName, buyerPhone: orders.buyerPhone,
 shipLine1: orders.shipLine1, shipLine2: orders.shipLine2, shipCity: orders.shipCity,
 shipState: orders.shipState, shipPostal: orders.shipPostal, shipCountry: orders.shipCountry,
 paidAt: orders.paidAt,
 labelUrl: orders.labelUrl, trackingNumber: orders.trackingNumber, trackingUrl: orders.trackingUrl,
 itemTitle: items.title, itemImages: items.images,
 itemWeightOz: items.weightOz, itemLengthIn: items.lengthIn, itemWidthIn: items.widthIn, itemHeightIn: items.heightIn,
 })
 .from(orders)
 .leftJoin(items, eq(items.id, orders.itemId))
 .where(eq(orders.id, orderId))
 .limit(1);
 return rows[0] ?? null;
}

/** Record a bought label and flip the order to shipped. */
export async function setOrderShipped(orderId: string, label: { labelUrl: string; trackingNumber: string; trackingUrl: string | null; labelCostCents: number }): Promise<void> {
 await getDb().update(orders).set({
 status: "shipped",
 shippedAt: new Date(),
 labelUrl: label.labelUrl,
 trackingNumber: label.trackingNumber,
 trackingUrl: label.trackingUrl,
 labelCostCents: label.labelCostCents,
 }).where(eq(orders.id, orderId));
}

/** Store a purchased label WITHOUT marking the order shipped — for auto-generate at order time, so
 *  the seller prints a prepaid label and marks it shipped only when they actually drop it off. */
export async function setOrderLabel(orderId: string, label: { labelUrl: string; trackingNumber: string; trackingUrl: string | null; labelCostCents: number }): Promise<void> {
 await getDb().update(orders).set({
 labelUrl: label.labelUrl,
 trackingNumber: label.trackingNumber,
 trackingUrl: label.trackingUrl,
 labelCostCents: label.labelCostCents,
 }).where(eq(orders.id, orderId));
}

/** Mark shipped once the seller confirms drop-off (the label was already generated). */
export async function markOrderShipped(orderId: string): Promise<void> {
 await getDb().update(orders).set({ status: "shipped", shippedAt: new Date() }).where(eq(orders.id, orderId));
}

export async function markTrackingEmailSent(orderId: string): Promise<void> {
 await getDb().update(orders).set({ trackingEmailSentAt: new Date() }).where(eq(orders.id, orderId));
}

export type OrderStatus = "paid" | "shipped" | "delivered" | "refunded";
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
 await getDb().update(orders).set({ status }).where(eq(orders.id, orderId));
}

// Refund + return-label columns are added additively (raw SQL, not the drizzle schema) so existing
// selects keep working before `db:push` runs. Self-healing + memoized.
let refundColsEnsured = false;
async function ensureRefundCols(): Promise<void> {
 if (refundColsEnsured) return;
 try {
 const s = rawSql();
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount_cents integer`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_label_url text`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_tracking_number text`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_label_cost_cents integer`;
 // Rejected-return bookkeeping: the store received the item back but wouldn't accept it.
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_status text`; // null | rejected
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_rejection_note text`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_evidence jsonb`; // photo URLs (chargeback proof)
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_shipback_label_url text`;
 await s`ALTER TABLE payouts ADD COLUMN IF NOT EXISTS reversed_at timestamptz`;
 refundColsEnsured = true;
 } catch { /* db:push covers it */ }
}

/** Record that the store rejected a returned item: reason + evidence photos (kept for a possible
 *  chargeback). Deliberately does NOT refund — the money stays with the store. */
export async function setReturnRejected(orderId: string, note: string | null, evidence: string[]): Promise<void> {
 await ensureRefundCols();
 await rawSql()`UPDATE orders SET return_status = 'rejected', return_rejection_note = ${note}, return_evidence = ${JSON.stringify(evidence.slice(0, 12))} WHERE id = ${orderId}`;
}

/** Store a ship-back label (store → buyer) when a rejected item is sent back to the buyer. */
export async function setShipBackLabel(orderId: string, url: string): Promise<void> {
 await ensureRefundCols();
 await rawSql()`UPDATE orders SET return_shipback_label_url = ${url} WHERE id = ${orderId}`;
}

/** Store a bought RETURN label (buyer → store) on the order. */
export async function setReturnLabel(orderId: string, l: { url: string; trackingNumber: string; costCents: number }): Promise<void> {
 await ensureRefundCols();
 await rawSql()`UPDATE orders SET return_label_url = ${l.url}, return_tracking_number = ${l.trackingNumber}, return_label_cost_cents = ${l.costCents} WHERE id = ${orderId}`;
}

/** The order's return-label info (null fields if none bought yet). Used for idempotency + to deduct
 *  the buyer-paid return-shipping cost from a refund. */
export async function getReturnLabelInfo(orderId: string): Promise<{ url: string | null; trackingNumber: string | null; costCents: number | null }> {
 await ensureRefundCols();
 const rows = await rawSql()`SELECT return_label_url, return_tracking_number, return_label_cost_cents FROM orders WHERE id = ${orderId} LIMIT 1` as Array<Record<string, unknown>>;
 const r = rows[0];
 return { url: (r?.return_label_url as string) ?? null, trackingNumber: (r?.return_tracking_number as string) ?? null, costCents: r?.return_label_cost_cents != null ? Number(r.return_label_cost_cents) : null };
}

/** Mark an order refunded and record WHEN + HOW MUCH — so a refunded sale is a real record, not just
 *  a mutated status. */
export async function markOrderRefunded(orderId: string, refundAmountCents: number): Promise<void> {
 await ensureRefundCols();
 await rawSql()`UPDATE orders SET status = 'refunded', refunded_at = now(), refund_amount_cents = ${refundAmountCents} WHERE id = ${orderId}`;
}

/** Reverse the seller-payout ledger row(s) for a refunded order, so seller-net reporting stops
 *  counting a sale that was given back. Idempotent (only reverses rows not already reversed). */
export async function reversePayoutForOrder(orderId: string): Promise<void> {
 await ensureRefundCols();
 await rawSql()`UPDATE payouts SET reversed_at = now() WHERE order_id = ${orderId} AND reversed_at IS NULL`;
}

export async function recordPayout(o: { orderId: string; sellerId: string; amountCents: number; currency: string }): Promise<void> {
 const db = getDb();
 await db.insert(payouts).values({
 orderId: o.orderId,
 sellerId: o.sellerId,
 amountCents: o.amountCents,
 currency: o.currency,
 status: "paid",
 paidAt: new Date(),
 });
}

/** Webhook idempotency — Stripe can deliver the same event twice. */
// ── Market Mode (in-person sales) ─────────────────────────────────────────────────────────────
// Additive columns so an order knows which channel/tender it came through and which market
// session + checkout produced it. Raw SQL (like the refund cols) so nothing needs `db:push`.
let marketColsEnsured = false;
export async function ensureMarketOrderCols(): Promise<void> {
 if (marketColsEnsured) return;
 try {
 const s = rawSql();
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'online'`; // online | market
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tender text`; // card | cash | …
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_session_id uuid`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_checkout_id uuid`;
 // One order per (PaymentIntent, item): a cart is N orders on ONE intent, so the intent alone can't be
 // unique — but the same item can never be recorded twice for the same payment (closes the
 // check-then-act gap in fulfill()). Drops the earlier intent-only index if it was ever created.
 await s`DROP INDEX IF EXISTS orders_pi_uniq`;
 await s`DROP INDEX IF EXISTS orders_market_checkout_uniq`;
 await s`CREATE UNIQUE INDEX IF NOT EXISTS orders_pi_item_uniq ON orders (stripe_payment_intent, item_id) WHERE stripe_payment_intent IS NOT NULL`;
 await s`CREATE UNIQUE INDEX IF NOT EXISTS orders_market_checkout_item_uniq ON orders (market_checkout_id, item_id) WHERE market_checkout_id IS NOT NULL`;
 // Per-sale pricing (a market discount never rewrites the listing) + cash handling.
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS list_price_cents integer`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents integer`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tendered_cents integer`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_cents integer`;
 await s`CREATE INDEX IF NOT EXISTS orders_market_session_idx ON orders (market_session_id) WHERE market_session_id IS NOT NULL`;
 marketColsEnsured = true;
 } catch { /* db:push covers it */ }
}

export async function setOrderMarketFields(orderId: string, f: { tender: string; sessionId: string | null; checkoutId: string; listPriceCents?: number | null; discountCents?: number | null; tenderedCents?: number | null; changeCents?: number | null }): Promise<void> {
 await ensureMarketOrderCols();
 await rawSql()`UPDATE orders SET channel = 'market', tender = ${f.tender}, market_session_id = ${f.sessionId}, market_checkout_id = ${f.checkoutId},
 list_price_cents = ${f.listPriceCents ?? null}, discount_cents = ${f.discountCents ?? null}, tendered_cents = ${f.tenderedCents ?? null}, change_cents = ${f.changeCents ?? null} WHERE id = ${orderId}`;
}

/** Cash bookkeeping recorded after the fact (change is computed once the tender is known). */
export async function setOrderCash(checkoutId: string, f: { tenderedCents: number | null; changeCents: number | null }): Promise<void> {
 await ensureMarketOrderCols();
 await rawSql()`UPDATE orders SET tendered_cents = ${f.tenderedCents}, change_cents = ${f.changeCents} WHERE market_checkout_id = ${checkoutId}`;
}

export type MarketOrderRow = {
 id: string; itemId: string; itemTitle: string | null; itemImage: string | null; itemBrand: string | null; itemCategory: string | null;
 amountCents: number; listPriceCents: number | null; discountCents: number | null; feeCents: number | null; currency: string; status: string; tender: string | null;
 stripePaymentIntent: string | null; checkoutId: string | null; paidAt: string | null; buyerEmail: string | null;
};

/** The in-person sales of one market session, newest first. */
export async function listMarketOrders(sellerId: string, sessionId: string): Promise<MarketOrderRow[]> {
 await ensureMarketOrderCols();
 const rows = (await rawSql()`
 SELECT o.id, o.item_id, i.title, i.images, i.brand, i.category, o.amount_cents, o.list_price_cents, o.discount_cents, o.fee_cents, o.currency, o.status, o.tender,
 o.stripe_payment_intent, o.market_checkout_id, o.paid_at, o.buyer_email
 FROM orders o LEFT JOIN items i ON i.id = o.item_id
 WHERE o.seller_id = ${sellerId} AND o.market_session_id = ${sessionId}
 ORDER BY o.paid_at DESC NULLS LAST, o.created_at DESC`) as Array<Record<string, unknown>>;
 return rows.map((r) => ({
 id: String(r.id), itemId: String(r.item_id), itemTitle: (r.title as string) ?? null, itemBrand: (r.brand as string) ?? null, itemCategory: (r.category as string) ?? null,
 itemImage: Array.isArray(r.images) && r.images.length ? String(r.images[0]) : null,
 amountCents: Number(r.amount_cents), listPriceCents: r.list_price_cents == null ? null : Number(r.list_price_cents), discountCents: r.discount_cents == null ? null : Number(r.discount_cents),
 feeCents: r.fee_cents == null ? null : Number(r.fee_cents), currency: String(r.currency),
 status: String(r.status), tender: (r.tender as string) ?? null, stripePaymentIntent: (r.stripe_payment_intent as string) ?? null,
 checkoutId: (r.market_checkout_id as string) ?? null, paidAt: r.paid_at ? new Date(r.paid_at as string).toISOString() : null, buyerEmail: (r.buyer_email as string) ?? null,
 }));
}

/** The orders a market checkout already produced (one per item) — for crash-safe retries. */
export async function getOrdersByMarketCheckout(checkoutId: string): Promise<{ id: string; itemId: string }[]> {
 await ensureMarketOrderCols();
 const rows = (await rawSql()`SELECT id, item_id FROM orders WHERE market_checkout_id = ${checkoutId}`) as Array<{ id: string; item_id: string }>;
 return rows.map((r) => ({ id: String(r.id), itemId: String(r.item_id) }));
}

// ── Collect in store ──────────────────────────────────────────────────────────────────────────
// How the buyer got the piece, and where she collected it from. Additive raw-SQL columns like the
// Market Mode ones above, so nothing needs `db:push`. `delivery_method` defaults to 'ship' — every
// order placed before collection existed IS a delivery, and that must stay true.
let pickupColsEnsured = false;
export async function ensurePickupOrderCols(): Promise<void> {
 if (pickupColsEnsured) return;
 try {
 const s = rawSql();
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'ship'`; // ship | pickup
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS collect_from text`;
 await s`ALTER TABLE orders ADD COLUMN IF NOT EXISTS collect_instructions text`;
 pickupColsEnsured = true;
 } catch { /* db:push covers it */ }
}

/**
 * Record that this order is being collected, not posted.
 *
 * Called from the webhook with what the SERVER decided at payment time (see checkout-delivery), so
 * a shopper can never stamp her own order as a collection.
 */
export async function setOrderPickup(orderId: string, f: { collectFrom: string | null; instructions: string | null }): Promise<void> {
 await ensurePickupOrderCols();
 await rawSql()`UPDATE orders SET delivery_method = 'pickup', collect_from = ${f.collectFrom}, collect_instructions = ${f.instructions} WHERE id = ${orderId}`;
}

/**
 * Which of a seller's orders are collections. A SEPARATE query rather than a join into
 * listSellerOrders, and swallowed on failure: a store's whole orders list must never go dark
 * because one additive column isn't there yet.
 */
export async function listPickupOrderIds(sellerId: string): Promise<string[]> {
 await ensurePickupOrderCols();
 try {
 const rows = (await rawSql()`SELECT id FROM orders WHERE seller_id = ${sellerId} AND delivery_method = 'pickup'`) as Array<{ id: string }>;
 return rows.map((r) => String(r.id));
 } catch { return []; }
}

/** How one order leaves the shop. Read separately from getOrderDetail — these columns aren't in the drizzle schema. */
export async function getOrderDelivery(orderId: string): Promise<{ method: "ship" | "pickup"; collectFrom: string | null; instructions: string | null }> {
 await ensurePickupOrderCols();
 const rows = (await rawSql()`SELECT delivery_method, collect_from, collect_instructions FROM orders WHERE id = ${orderId}`) as Array<Record<string, unknown>>;
 const r = rows[0];
 if (!r || r.delivery_method !== "pickup") return { method: "ship", collectFrom: null, instructions: null };
 return { method: "pickup", collectFrom: (r.collect_from as string) ?? null, instructions: (r.collect_instructions as string) ?? null };
}

export async function orderExistsForPaymentIntent(pi: string): Promise<boolean> {
 const db = getDb();
 const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.stripePaymentIntent, pi)).limit(1);
 return rows.length > 0;
}

/** The order(s) tied to a PaymentIntent — used to unwind a sale on a dispute/chargeback or refund. */
export async function getOrdersByPaymentIntent(pi: string): Promise<{ id: string; itemId: string; sellerId: string; status: string }[]> {
 const db = getDb();
 const rows = await db.select({ id: orders.id, itemId: orders.itemId, sellerId: orders.sellerId, status: orders.status }).from(orders).where(eq(orders.stripePaymentIntent, pi));
 return rows.map((r) => ({ id: String(r.id), itemId: String(r.itemId), sellerId: String(r.sellerId), status: String(r.status) }));
}

/**
 * The seller's private note on an order. Self-heals the column so a deploy works
 * before db:push runs, matching how items handles its newer fields.
 */
let noteColEnsured = false;
export async function setOrderNote(orderId: string, note: string | null): Promise<void> {
 const db = getDb();
 if (!noteColEnsured) {
  try {
   await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_note text`);
   noteColEnsured = true;
  } catch { /* db:push covers it */ }
 }
 const clean = note && note.trim() ? note.trim().slice(0, 2000) : null;
 await db.update(orders).set({ internalNote: clean }).where(eq(orders.id, orderId));
}

/**
 * Record the sales tax on an order after Stripe has settled it. Kept separate
 * from createPaidOrder because the tax total lives on the Checkout Session, which
 * the webhook reads, while the order is built per line item.
 *
 * Self-heals the columns so a deploy works before db:push, matching how the rest
 * of this table handles newer fields.
 */
let taxColsEnsured = false;
export async function setOrderTax(orderId: string, taxCents: number | null, jurisdiction: string | null): Promise<void> {
 const db = getDb();
 if (!taxColsEnsured) {
  try {
   await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_cents integer`);
   await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_jurisdiction text`);
   taxColsEnsured = true;
  } catch { /* db:push covers it */ }
 }
 await db.update(orders)
  .set({ taxCents: taxCents == null ? null : Math.round(taxCents), taxJurisdiction: jurisdiction })
  .where(eq(orders.id, orderId));
}
