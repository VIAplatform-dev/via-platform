import { and, desc, eq, isNull, inArray, sql } from "drizzle-orm";
import { getDb, orders, payouts, items, sellers } from "./index";
import type { Order } from "./index";

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
