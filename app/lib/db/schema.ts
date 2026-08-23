import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, integer, timestamp, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";

// ───────────────────────────────────────────────────────────────────────────
// The transactional core of the VYA recommerce platform (Drizzle + Neon).
// One-of-one inventory: every Item is quantity 1; availability is the status,
// never a count. A Reservation is a short-lived TTL lock so an item can never be
// sold twice. Money model = seller is merchant of record (Stripe Connect),
// VYA's revenue is the subscription; payments run break-even.
// ───────────────────────────────────────────────────────────────────────────

export const itemStatus = pgEnum("item_status", ["draft", "active", "reserved", "sold", "removed"]);
export const orderStatus = pgEnum("order_status", ["pending", "paid", "shipped", "delivered", "fulfilled", "cancelled", "refunded"]);
export const payoutStatus = pgEnum("payout_status", ["pending", "paid", "failed"]);

// A seller = a store. Replaces the hardcoded stores.ts for self-serve signup.
export const sellers = pgTable("sellers", {
 id: uuid("id").defaultRandom().primaryKey(),
 slug: text("slug").notNull().unique(), // the universal store key (URLs, joins)
 name: text("name").notNull(),
 email: text("email").notNull(),
 stripeAccountId: text("stripe_account_id"), // Connect account (accepts payments)
 stripeCustomerId: text("stripe_customer_id"), // their subscription to VYA
 subscriptionStatus: text("subscription_status"), // trialing | active | past_due | canceled
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// One-of-one inventory item. Quantity is always 1 — the status carries availability.
export const items = pgTable(
 "items",
 {
 id: uuid("id").defaultRandom().primaryKey(),
 sellerId: uuid("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
 title: text("title").notNull(),
 description: text("description"),
 priceCents: integer("price_cents").notNull().default(0),
 costCents: integer("cost_cents"), // what the seller paid — private, for their margin
 currency: text("currency").notNull().default("USD"),
 images: jsonb("images").$type<string[]>().notNull().default([]),
 brand: text("brand"),
 era: text("era"),
 material: text("material"),
 condition: text("condition"),
 size: text("size"),
 // Garment/flat measurements (bust/waist/length, or a bag's dimensions) — the #1 thing a secondhand
 // buyer needs since they can't try it on. Free text so it fits any category ("Bust 34\" · Waist 28\" · Length 40\"").
 measurements: text("measurements"),
 category: text("category"),
 status: itemStatus("status").notNull().default("draft"),
 weightOz: integer("weight_oz"),
 lengthIn: integer("length_in"),
 widthIn: integer("width_in"),
 heightIn: integer("height_in"),
 source: text("source").notNull().default("manual"), // manual | imported | ai
 externalUrl: text("external_url"),
 // Scheduled publish: a draft with publish_at in the future is "scheduled" — the cron flips it to
 // active at that time. NULL = not scheduled (a normal draft or an already-live item).
 publishAt: timestamp("publish_at", { withTimezone: true }),
 soldAt: timestamp("sold_at", { withTimezone: true }),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
 },
 (t) => [index("items_seller_status_idx").on(t.sellerId, t.status)],
);

// A TTL lock on an item during checkout. While a row is live (released_at IS NULL
// and not expired) the item is held; the engine flips items.status active→reserved
// atomically, and a partial-unique guarantees at most one live lock per item.
export const reservations = pgTable(
 "reservations",
 {
 id: uuid("id").defaultRandom().primaryKey(),
 itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
 buyerRef: text("buyer_ref"), // cart/session/buyer identifier
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
 releasedAt: timestamp("released_at", { withTimezone: true }), // set on release or conversion
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
 },
 (t) => [
 index("reservations_item_idx").on(t.itemId),
 uniqueIndex("reservations_one_live_per_item").on(t.itemId).where(sql`released_at IS NULL`),
 ],
);

// An order is created when payment succeeds (seller is merchant of record).
export const orders = pgTable(
 "orders",
 {
 id: uuid("id").defaultRandom().primaryKey(),
 itemId: uuid("item_id").notNull().references(() => items.id),
 sellerId: uuid("seller_id").notNull().references(() => sellers.id),
 buyerEmail: text("buyer_email"),
 buyerName: text("buyer_name"),
 buyerPhone: text("buyer_phone"),
 shipLine1: text("ship_line1"),
 shipLine2: text("ship_line2"),
 shipCity: text("ship_city"),
 shipState: text("ship_state"),
 shipPostal: text("ship_postal"),
 shipCountry: text("ship_country"),
 amountCents: integer("amount_cents").notNull(),
 feeCents: integer("fee_cents"), // VYA's application fee on this order
 shippingPaidCents: integer("shipping_paid_cents"), // shipping the buyer paid at checkout (buyer_pays); funds the label
 currency: text("currency").notNull().default("USD"),
 stripePaymentIntent: text("stripe_payment_intent"),
 status: orderStatus("status").notNull().default("pending"),
 confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
 // Shipping label (bought via Shippo in the fulfillment view).
 labelUrl: text("label_url"),
 trackingNumber: text("tracking_number"),
 trackingUrl: text("tracking_url"),
 labelCostCents: integer("label_cost_cents"),
 trackingEmailSentAt: timestamp("tracking_email_sent_at", { withTimezone: true }),
 shippedAt: timestamp("shipped_at", { withTimezone: true }),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
 paidAt: timestamp("paid_at", { withTimezone: true }),
 },
 (t) => [index("orders_seller_idx").on(t.sellerId), index("orders_item_idx").on(t.itemId)],
);

// A payout records money settling to the seller for an order.
export const payouts = pgTable("payouts", {
 id: uuid("id").defaultRandom().primaryKey(),
 orderId: uuid("order_id").notNull().references(() => orders.id),
 sellerId: uuid("seller_id").notNull().references(() => sellers.id),
 amountCents: integer("amount_cents").notNull(),
 currency: text("currency").notNull().default("USD"),
 stripeTransferId: text("stripe_transfer_id"),
 status: payoutStatus("status").notNull().default("pending"),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
 paidAt: timestamp("paid_at", { withTimezone: true }),
});

// A seller-defined collection (e.g. "Y2K", "Designer bags", "New arrivals"). Items
// belong to zero or more; when a one-of-one piece sells it simply drops out and the
// collection persists — so the curation work isn't wasted when something sells.
export const collections = pgTable(
 "collections",
 {
 id: uuid("id").defaultRandom().primaryKey(),
 sellerId: uuid("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
 title: text("title").notNull(),
 slug: text("slug").notNull(),
 createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
 },
 (t) => [uniqueIndex("collections_seller_slug_idx").on(t.sellerId, t.slug)],
);

// Membership join: an item in a collection (many-to-many).
export const itemCollections = pgTable(
 "item_collections",
 {
 itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
 collectionId: uuid("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
 // Where this item sits INSIDE the collection. Without it the order was whatever Postgres chose to
 // return, so "show the first 5 of this collection" was arbitrary and could differ between page
 // loads. Nullable so existing rows stay valid — they sort behind anything explicitly ordered.
 position: integer("position"),
 },
 (t) => [primaryKey({ columns: [t.itemId, t.collectionId] })],
);

export type Seller = typeof sellers.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Reservation = typeof reservations.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
