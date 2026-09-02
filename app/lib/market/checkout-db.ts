import { neon } from "@neondatabase/serverless";
import { reserveItemForMarket, releaseMarketReservation, markSold, getItem } from "@/app/lib/db/inventory";
import { createPaidOrder, recordPayout, setOrderMarketFields, getOrdersByMarketCheckout, ensureMarketOrderCols } from "@/app/lib/db/orders";
import { getSellerById } from "@/app/lib/db/sellers";
import { recordEvent } from "@/app/lib/analytics-events-db";
import { creditConsignedSale } from "@/app/lib/consignment-db";
import { markCheckoutRecovered } from "@/app/lib/checkout-attempts-db";
import { delistEverywhere } from "@/app/lib/cross-listing-db";
import { applicationFeeCents } from "@/app/lib/payments-config";
import { logError } from "@/app/lib/error-log";
import { sendOpsAlert } from "@/app/lib/ops-alert";
import { refundMarketPayment, sellerAccount } from "./stripe-market";
import { allowedFromForPaid, checkoutExpiry, MARKET_CHECKOUT_TTL_SECONDS, type MarketCheckoutStatus, type MarketTender } from "./checkout-core";
import { cartTotals, normalizeCart, type CartLine } from "./sale-core";

// ───────────────────────────────────────────────────────────────────────────
// Market checkout engine. A checkout holds ONE OR MORE items for one payment. Every status change
// is ONE status-guarded UPDATE, so a webhook, a poll, a cron and a tap on the seller's phone can all
// race and exactly one wins each transition. The row is also the audit trail.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
export async function ensureMarketCheckoutTables(): Promise<void> {
 if (ensured) return;
 const s = db();
 await s`CREATE TABLE IF NOT EXISTS market_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  item_id UUID NOT NULL,
  session_id UUID,
  client_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  tender TEXT NOT NULL,
  prior_status TEXT NOT NULL DEFAULT 'active',
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  stripe_checkout_session TEXT,
  stripe_payment_intent TEXT,
  pay_url TEXT,
  order_id UUID,
  device_label TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  stripe_checked_at TIMESTAMPTZ
 )`;
 await s`ALTER TABLE market_checkouts ADD COLUMN IF NOT EXISTS stripe_checked_at TIMESTAMPTZ`;
 // Multi-item + per-sale pricing + cash + receipt (all additive).
 await s`ALTER TABLE market_checkouts ADD COLUMN IF NOT EXISTS items JSONB`; // [{itemId,listCents,saleCents,prior}]
 await s`ALTER TABLE market_checkouts ADD COLUMN IF NOT EXISTS list_cents INTEGER`;
 await s`ALTER TABLE market_checkouts ADD COLUMN IF NOT EXISTS tendered_cents INTEGER`;
 await s`ALTER TABLE market_checkouts ADD COLUMN IF NOT EXISTS change_cents INTEGER`;
 await s`ALTER TABLE market_checkouts ADD COLUMN IF NOT EXISTS receipt_email TEXT`;
 await s`CREATE UNIQUE INDEX IF NOT EXISTS market_checkouts_client_key ON market_checkouts (seller_id, client_key)`;
 await s`CREATE UNIQUE INDEX IF NOT EXISTS market_checkouts_pi ON market_checkouts (stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL`;
 await s`CREATE INDEX IF NOT EXISTS market_checkouts_open ON market_checkouts (seller_id, status) WHERE status = 'awaiting_payment'`;
 await s`CREATE INDEX IF NOT EXISTS market_checkouts_item ON market_checkouts (item_id)`;
 await s`CREATE TABLE IF NOT EXISTS market_checkout_events (
  id BIGSERIAL PRIMARY KEY,
  checkout_id UUID NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  from_status TEXT, to_status TEXT,
  detail JSONB
 )`;
 await s`CREATE INDEX IF NOT EXISTS market_checkout_events_checkout ON market_checkout_events (checkout_id)`;
 await ensureMarketOrderCols();
 ensured = true;
}

export type CheckoutLine = CartLine & { prior: "active" | "draft" };
export type MarketCheckout = {
 id: string; sellerId: string; itemId: string; sessionId: string | null; clientKey: string;
 amountCents: number; listCents: number; currency: string; tender: MarketTender; status: MarketCheckoutStatus; priorStatus: "active" | "draft";
 items: CheckoutLine[];
 stripeCheckoutSession: string | null; stripePaymentIntent: string | null; payUrl: string | null;
 orderId: string | null; deviceLabel: string | null; failureReason: string | null;
 tenderedCents: number | null; changeCents: number | null; receiptEmail: string | null;
 createdAt: string; expiresAt: string; paidAt: string | null; stripeCheckedAt: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function row(r: any): MarketCheckout {
 const iso = (v: any) => (v ? new Date(v).toISOString() : null);
 const prior: "active" | "draft" = r.prior_status === "draft" ? "draft" : "active";
 const rawItems = Array.isArray(r.items) ? r.items : (typeof r.items === "string" ? JSON.parse(r.items) : null);
 const items: CheckoutLine[] = Array.isArray(rawItems) && rawItems.length
 ? rawItems.map((l: any) => ({ itemId: String(l.itemId), listCents: Number(l.listCents) || 0, saleCents: Number(l.saleCents) || 0, prior: l.prior === "draft" ? "draft" : "active" }))
 : [{ itemId: String(r.item_id), listCents: Number(r.amount_cents), saleCents: Number(r.amount_cents), prior }]; // pre-cart rows
 return {
 id: String(r.id), sellerId: String(r.seller_id), itemId: String(r.item_id), sessionId: r.session_id ? String(r.session_id) : null,
 clientKey: String(r.client_key), amountCents: Number(r.amount_cents), listCents: r.list_cents == null ? items.reduce((s, l) => s + l.listCents, 0) : Number(r.list_cents),
 currency: String(r.currency), tender: r.tender, status: r.status, priorStatus: prior, items,
 stripeCheckoutSession: r.stripe_checkout_session ?? null, stripePaymentIntent: r.stripe_payment_intent ?? null, payUrl: r.pay_url ?? null,
 orderId: r.order_id ? String(r.order_id) : null, deviceLabel: r.device_label ?? null, failureReason: r.failure_reason ?? null,
 tenderedCents: r.tendered_cents == null ? null : Number(r.tendered_cents), changeCents: r.change_cents == null ? null : Number(r.change_cents), receiptEmail: r.receipt_email ?? null,
 createdAt: iso(r.created_at)!, expiresAt: iso(r.expires_at)!, paidAt: iso(r.paid_at), stripeCheckedAt: iso(r.stripe_checked_at),
 };
}

async function logEvent(checkoutId: string, source: string, from: string | null, to: string | null, detail?: Record<string, unknown>): Promise<void> {
 await db()`INSERT INTO market_checkout_events (checkout_id, source, from_status, to_status, detail) VALUES (${checkoutId}, ${source}, ${from}, ${to}, ${detail ? JSON.stringify(detail) : null})`.catch(() => {});
}

export async function getCheckout(id: string): Promise<MarketCheckout | null> {
 await ensureMarketCheckoutTables();
 const rows = await db()`SELECT * FROM market_checkouts WHERE id = ${id} LIMIT 1`;
 return rows[0] ? row(rows[0]) : null;
}

export async function getCheckoutByClientKey(sellerId: string, clientKey: string): Promise<MarketCheckout | null> {
 await ensureMarketCheckoutTables();
 const rows = await db()`SELECT * FROM market_checkouts WHERE seller_id = ${sellerId} AND client_key = ${clientKey} LIMIT 1`;
 return rows[0] ? row(rows[0]) : null;
}

/** The open (awaiting) checkout holding an item, if any — so a second device sees who holds it. */
export async function getOpenCheckoutForItem(itemId: string): Promise<MarketCheckout | null> {
 await ensureMarketCheckoutTables();
 const rows = await db()`SELECT * FROM market_checkouts WHERE status = 'awaiting_payment' AND (item_id = ${itemId} OR items @> ${JSON.stringify([{ itemId }])}::jsonb) ORDER BY created_at DESC LIMIT 1`;
 return rows[0] ? row(rows[0]) : null;
}

export type StartResult =
 | { ok: true; checkout: MarketCheckout; existing: boolean }
 | { ok: false; code: "not_found" | "not_sellable" | "reserved" | "no_price" | "in_progress" | "empty"; message: string; holder?: string | null; itemId?: string };

/**
 * Start a checkout for one or more items: reserve each (atomic; contends with online buyers), then
 * record the intent. All-or-nothing — if any item can't be held, the ones already held are released.
 * Idempotent on (seller, clientKey). Never charges here.
 */
export async function startCheckout(o: { sellerId: string; lines: { itemId: string; saleCents?: number | null }[]; sessionId: string | null; clientKey: string; tender: MarketTender; deviceLabel?: string | null }): Promise<StartResult> {
 await ensureMarketCheckoutTables();
 const dup = await getCheckoutByClientKey(o.sellerId, o.clientKey);
 if (dup) return { ok: true, checkout: dup, existing: true };
 const wanted = normalizeCart(o.lines.map((l) => ({ itemId: l.itemId, listCents: 0, saleCents: 0 })));
 if (!wanted.length) return { ok: false, code: "empty", message: "Nothing to sell." };

 // Validate every line before touching any reservation.
 const lines: CheckoutLine[] = [];
 for (const w of wanted) {
 const item = await getItem(w.itemId);
 if (!item || item.sellerId !== o.sellerId) return { ok: false, code: "not_found", message: "Item not found.", itemId: w.itemId };
 if (!(item.priceCents > 0)) return { ok: false, code: "no_price", message: `Set a price for “${item.title}” first.`, itemId: item.id };
 if (item.status === "sold" || item.status === "removed") return { ok: false, code: "not_sellable", message: item.status === "sold" ? `“${item.title}” has already sold.` : `“${item.title}” was removed from sale.`, itemId: item.id };
 if (item.status === "reserved") {
 const open = await getOpenCheckoutForItem(item.id);
 if (open) return { ok: false, code: "in_progress", message: `A checkout is already in progress for “${item.title}”${open.deviceLabel ? ` on ${open.deviceLabel}` : ""}.`, holder: open.id, itemId: item.id };
 return { ok: false, code: "reserved", message: `“${item.title}” is reserved by an online checkout — try again in a few minutes.`, itemId: item.id };
 }
 const requested = o.lines.find((l) => l.itemId === w.itemId)?.saleCents;
 const saleCents = requested == null ? item.priceCents : Math.max(0, Math.min(item.priceCents, Math.round(Number(requested) || 0)));
 lines.push({ itemId: item.id, listCents: item.priceCents, saleCents, prior: item.status === "draft" ? "draft" : "active" });
 }

 const checkoutId = crypto.randomUUID();
 const held: CheckoutLine[] = [];
 for (const l of lines) {
 const res = await reserveItemForMarket(l.itemId, `market-${checkoutId}`, MARKET_CHECKOUT_TTL_SECONDS);
 if (res) { held.push(l); continue; }
 for (const h of held) await releaseMarketReservation(h.itemId, h.prior).catch(() => {});
 const open = await getOpenCheckoutForItem(l.itemId);
 if (open) return { ok: false, code: "in_progress", message: "Another device just started a checkout for one of these items.", holder: open.id, itemId: l.itemId };
 return { ok: false, code: "reserved", message: "Someone just reserved one of these items online.", itemId: l.itemId };
 }

 const totals = cartTotals(lines);
 const first = lines[0];
 const currency = (await getItem(first.itemId))?.currency || "USD";
 try {
 const rows = await db()`INSERT INTO market_checkouts (id, seller_id, item_id, session_id, client_key, amount_cents, list_cents, currency, tender, prior_status, items, device_label, expires_at)
  VALUES (${checkoutId}, ${o.sellerId}, ${first.itemId}, ${o.sessionId}, ${o.clientKey}, ${totals.saleCents}, ${totals.listCents}, ${currency}, ${o.tender}, ${first.prior}, ${JSON.stringify(lines)}::jsonb, ${o.deviceLabel ?? null}, ${checkoutExpiry(new Date()).toISOString()})
  RETURNING *`;
 const c = row(rows[0]);
 await logEvent(c.id, "ui", null, "awaiting_payment", { tender: o.tender, items: lines.length, discountCents: totals.discountCents });
 return { ok: true, checkout: c, existing: false };
 } catch (e) {
 for (const h of held) await releaseMarketReservation(h.itemId, h.prior).catch(() => {});
 const dup2 = await getCheckoutByClientKey(o.sellerId, o.clientKey); // unique-violation on clientKey = concurrent double-tap
 if (dup2) return { ok: true, checkout: dup2, existing: true };
 logError("market-checkout-start", e, { context: { items: lines.map((l) => l.itemId) } });
 throw e;
 }
}

/** Claim the right to ask Stripe about this checkout: true only if nobody has in the last `minMs`. */
export async function claimStripeCheck(checkoutId: string, minMs = 6000): Promise<boolean> {
 const rows = await db()`UPDATE market_checkouts SET stripe_checked_at = now() WHERE id = ${checkoutId}
  AND (stripe_checked_at IS NULL OR stripe_checked_at < now() - (${Math.round(minMs)} || ' milliseconds')::interval) RETURNING id`;
 return rows.length > 0;
}

/** Store the Stripe handles once the payment object exists. */
export async function attachStripe(checkoutId: string, f: { session?: string | null; paymentIntent?: string | null; payUrl?: string | null }): Promise<void> {
 await db()`UPDATE market_checkouts SET stripe_checkout_session = coalesce(${f.session ?? null}, stripe_checkout_session), stripe_payment_intent = coalesce(${f.paymentIntent ?? null}, stripe_payment_intent), pay_url = coalesce(${f.payUrl ?? null}, pay_url), updated_at = now() WHERE id = ${checkoutId}`;
}

/** Cash bookkeeping: what was handed over and what went back. */
export async function setCash(checkoutId: string, tenderedCents: number | null, changeCents: number | null): Promise<void> {
 await db()`UPDATE market_checkouts SET tendered_cents = ${tenderedCents}, change_cents = ${changeCents}, updated_at = now() WHERE id = ${checkoutId}`;
}

/** awaiting → canceled | expired | failed. Releases every held item. Returns the row if THIS call won. */
export async function closeCheckout(checkoutId: string, to: "canceled" | "expired" | "failed", source: string, reason?: string | null): Promise<MarketCheckout | null> {
 await ensureMarketCheckoutTables();
 const rows = await db()`UPDATE market_checkouts SET status = ${to}, failure_reason = ${reason ?? null}, updated_at = now()
  WHERE id = ${checkoutId} AND status = 'awaiting_payment' RETURNING *`;
 if (!rows[0]) return null;
 const c = row(rows[0]);
 for (const l of c.items) await releaseMarketReservation(l.itemId, l.prior).catch((e) => logError("market-release", e, { context: { checkoutId, itemId: l.itemId } }));
 await logEvent(c.id, source, "awaiting_payment", to, reason ? { reason } : undefined);
 return c;
}

export type FinalizeResult = { status: "paid" | "already_paid" | "paid_conflict" | "not_claimable"; checkout: MarketCheckout | null; orderId: string | null; orderIds: string[] };

/**
 * The ONLY path to `paid`. Money first: claim the checkout row (unique on the PaymentIntent, guarded
 * on the statuses a payment may arrive from). Then flip each item to sold and record one order per
 * item. Idempotent — webhook, poll and cron may all call this; one records the sale, the rest observe
 * it. A crash mid-way is repaired by calling again (existing orders are adopted, not duplicated).
 * If some item can no longer be sold (its hold lapsed and it sold elsewhere) that LINE is refunded
 * automatically and the checkout is flagged `paid_conflict` for the seller to see.
 */
export async function finalizeMarketSale(o: { checkoutId: string; paymentIntent: string | null; tender: MarketTender; source: string; receiptEmail?: string | null }): Promise<FinalizeResult> {
 await ensureMarketCheckoutTables();
 const allowed = allowedFromForPaid();
 const claimed = await db()`UPDATE market_checkouts
  SET status = 'paid', paid_at = coalesce(paid_at, now()), tender = ${o.tender}, stripe_payment_intent = coalesce(${o.paymentIntent}, stripe_payment_intent), receipt_email = coalesce(${o.receiptEmail ?? null}, receipt_email), updated_at = now()
  WHERE id = ${o.checkoutId} AND status = ANY(${allowed}) RETURNING *`;
 let c: MarketCheckout;
 if (claimed[0]) {
 c = row(claimed[0]);
 await logEvent(c.id, o.source, "awaiting_payment", "paid", { paymentIntent: o.paymentIntent, tender: o.tender });
 } else {
 const cur = await getCheckout(o.checkoutId);
 if (!cur) return { status: "not_claimable", checkout: null, orderId: null, orderIds: [] };
 if (cur.status === "paid_conflict") return { status: "paid_conflict", checkout: cur, orderId: cur.orderId, orderIds: [] };
 if (cur.status !== "paid") return { status: "not_claimable", checkout: cur, orderId: null, orderIds: [] };
 // A SECOND payment for an already-paid checkout (customer paid the QR while the seller also keyed
 // the card): the sale stands on the first; give the duplicate back automatically, never keep it.
 if (o.paymentIntent && cur.stripePaymentIntent && o.paymentIntent !== cur.stripePaymentIntent) {
 const seller = await getSellerById(cur.sellerId).catch(() => null);
 const acct = seller ? await sellerAccount(seller.slug) : null;
 if (acct) await refundMarketPayment({ paymentIntent: o.paymentIntent, acct: acct.acct }).then(() => logEvent(cur.id, o.source, "paid", "paid", { duplicateRefunded: o.paymentIntent })).catch((e) => { logError("market-duplicate-refund", e, { context: { checkoutId: cur.id, pi: o.paymentIntent }, severity: "critical" }); sendOpsAlert("Market Mode: duplicate payment NOT refunded", `Checkout ${cur.id} received a second payment ${o.paymentIntent} and the automatic refund failed. Refund it in Stripe.`).catch(() => {}); });
 }
 if (o.receiptEmail && !cur.receiptEmail) await db()`UPDATE market_checkouts SET receipt_email = ${o.receiptEmail} WHERE id = ${cur.id}`.catch(() => {});
 const done = await getOrdersByMarketCheckout(cur.id);
 if (done.length >= cur.items.length) return { status: "already_paid", checkout: cur, orderId: cur.orderId ?? done[0]?.id ?? null, orderIds: done.map((d) => d.id) };
 c = cur; // paid but some orders missing (crash repair) → finish the job below
 }

 const existing = await getOrdersByMarketCheckout(c.id);
 const seller = await getSellerById(c.sellerId).catch(() => null);
 const orderIds: string[] = existing.map((e) => e.id);
 const conflicts: CheckoutLine[] = [];
 for (const l of c.items) {
 if (existing.some((e) => e.itemId === l.itemId)) continue;
 const sold = await markSold(l.itemId);
 if (!sold) { conflicts.push(l); continue; }
 const fee = o.tender === "cash" ? 0 : applicationFeeCents(l.saleCents);
 let orderId: string;
 try {
 const order = await createPaidOrder({ itemId: l.itemId, sellerId: c.sellerId, buyerEmail: c.receiptEmail ?? o.receiptEmail ?? null, amountCents: l.saleCents, feeCents: fee, shippingPaidCents: 0, currency: (sold.currency || c.currency || "USD").toUpperCase(), stripePaymentIntent: o.paymentIntent });
 orderId = String(order.id);
 } catch (e) {
 // Unique (intent, item) / (checkout, item) fired → the order exists; adopt it.
 const again = (await getOrdersByMarketCheckout(c.id)).find((x) => x.itemId === l.itemId);
 if (!again) { logError("market-create-order", e, { context: { checkoutId: c.id, itemId: l.itemId } }); throw e; }
 orderId = again.id;
 }
 await setOrderMarketFields(orderId, { tender: o.tender === "cash" ? "cash" : "card", sessionId: c.sessionId, checkoutId: c.id, listPriceCents: l.listCents, discountCents: l.listCents - l.saleCents, tenderedCents: c.tenderedCents, changeCents: c.changeCents });
 orderIds.push(orderId);
 await recordPayout({ orderId, sellerId: c.sellerId, amountCents: l.saleCents - fee, currency: (sold.currency || "USD").toUpperCase() }).catch((e) => logError("market-payout", e, { context: { orderId } }));
 if (seller?.slug) recordEvent({ type: "purchase", storeSlug: seller.slug, itemId: l.itemId, priceCents: l.saleCents, surface: "market" }).catch(() => {});
 creditConsignedSale({ productId: l.itemId, orderId, soldPriceCents: l.saleCents, channel: "market" }).catch(() => {});
 markCheckoutRecovered(l.itemId).catch(() => {});
 delistEverywhere(l.itemId, "vya").catch(() => {});
 }
 if (orderIds.length && !c.orderId) await db()`UPDATE market_checkouts SET order_id = ${orderIds[0]}, updated_at = now() WHERE id = ${c.id} AND order_id IS NULL`;

 if (conflicts.length) {
 // The money is real but some pieces went elsewhere while our hold had lapsed. Never pretend: refund
 // exactly those lines, flag the checkout, and tell a human.
 const refundCents = conflicts.reduce((s, l) => s + l.saleCents, 0);
 await db()`UPDATE market_checkouts SET status = 'paid_conflict', updated_at = now() WHERE id = ${c.id} AND status = 'paid'`;
 await logEvent(c.id, o.source, "paid", "paid_conflict", { items: conflicts.map((l) => l.itemId), refundCents });
 await logError("market-paid-conflict", new Error("payment received for an unsellable item"), { context: { checkoutId: c.id, items: conflicts.map((l) => l.itemId) }, severity: "critical" });
 sendOpsAlert("Market Mode: payment for an unsellable item", `Checkout ${c.id}: ${conflicts.length} item(s) were paid for but no longer sellable. Auto-refund of ${refundCents} ${c.currency} attempted — verify in Stripe.`).catch(() => {});
 const pi = o.paymentIntent || c.stripePaymentIntent;
 if (pi && refundCents > 0 && o.tender !== "cash") {
 const acct = seller ? await sellerAccount(seller.slug) : null;
 if (acct) await refundMarketPayment({ paymentIntent: pi, acct: acct.acct, amountCents: refundCents }).then(() => logEvent(c.id, o.source, "paid_conflict", "paid_conflict", { refunded: pi, refundCents })).catch((e) => logError("market-conflict-refund", e, { context: { checkoutId: c.id, pi }, severity: "critical" }));
 }
 return { status: "paid_conflict", checkout: { ...c, status: "paid_conflict", orderId: orderIds[0] ?? null }, orderId: orderIds[0] ?? null, orderIds };
 }
 return { status: "paid", checkout: { ...c, orderId: orderIds[0] ?? null }, orderId: orderIds[0] ?? null, orderIds };
}

/** Every open checkout platform-wide — the reconcile cron's worklist. */
export async function listOpenCheckouts(limit = 200): Promise<MarketCheckout[]> {
 await ensureMarketCheckoutTables();
 const rows = await db()`SELECT * FROM market_checkouts WHERE status = 'awaiting_payment' ORDER BY created_at ASC LIMIT ${limit}`;
 return rows.map(row);
}

/** Paid but missing orders (crashed between claim and insert) — the cron finishes them. */
export async function listPaidWithoutOrder(limit = 50): Promise<MarketCheckout[]> {
 await ensureMarketCheckoutTables();
 const rows = await db()`SELECT c.* FROM market_checkouts c WHERE c.status = 'paid' AND c.paid_at < now() - interval '30 seconds'
  AND (SELECT count(*) FROM orders o WHERE o.market_checkout_id = c.id) < coalesce(jsonb_array_length(c.items), 1) ORDER BY c.paid_at ASC LIMIT ${limit}`;
 return rows.map(row);
}

/** Recent checkouts for a seller/session (audit + "unfinished" list). */
export async function listCheckouts(sellerId: string, sessionId: string | null, limit = 50): Promise<MarketCheckout[]> {
 await ensureMarketCheckoutTables();
 const rows = sessionId
 ? await db()`SELECT * FROM market_checkouts WHERE seller_id = ${sellerId} AND session_id = ${sessionId} ORDER BY created_at DESC LIMIT ${limit}`
 : await db()`SELECT * FROM market_checkouts WHERE seller_id = ${sellerId} ORDER BY created_at DESC LIMIT ${limit}`;
 return rows.map(row);
}
