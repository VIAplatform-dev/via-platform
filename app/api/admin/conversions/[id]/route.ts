import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sendStoreSaleEmail } from "@/app/lib/email";
import { stores, storeContactEmails } from "@/app/lib/stores";
import { suppressConversion } from "@/app/lib/analytics-db";

function hashPassword(password: string): string {
 const crypto = require("crypto");
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === hashPassword(adminPassword);
}

/** Attempt to send the store sale notification for a conversion.
 * Returns true if the email was sent, false if skipped (already sent or no config),
 * throws if Resend fails. */
async function trySendStoreSaleEmail(
 dbUrl: string,
 conversionId: string,
 { force = false }: { force?: boolean } = {}
): Promise<boolean> {
 const sql = neon(dbUrl);
 await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS sale_email_sent BOOLEAN DEFAULT FALSE`.catch(() => {});
 const rows = await sql`
 SELECT store_slug, store_name, order_total, currency, order_id, timestamp, matched_click_data, sale_email_sent
 FROM conversions WHERE conversion_id = ${conversionId} LIMIT 1
 `;
 const conv = rows[0] as Record<string, unknown> | undefined;
 if (!conv) return false;
 if (!force && conv.sale_email_sent) return false;

 // Match the DB slug against canonical store slugs ignoring hyphens/punctuation,
 // since conversion rows may store "sassysowhat" while the config slug is "sassy-so-what"
 // (and Collabs can append trailing punctuation, e.g. "dear-muse,").
 const rawSlug = (conv.store_slug as string) ?? "";
 const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
 const rawCanon = canon(rawSlug);
 const storeConfig = stores.find((s) => canon(s.slug) === rawCanon);
 // Resolve the email by the canonical config slug so it works regardless of how the DB slug is formatted.
 const storeSlug = storeConfig?.slug ?? rawSlug;
 const storeEmail = storeConfig ? storeContactEmails[storeConfig.slug] : undefined;
 if (!storeConfig || !storeEmail) {
 throw new Error(`No email config for store_slug="${rawSlug}" (normalized="${storeSlug}", storeConfig=${!!storeConfig}, storeEmail=${!!storeEmail})`);
 }

 const productName = (conv.matched_click_data as { productName?: string } | null)?.productName ?? null;
 await sendStoreSaleEmail({
 storeEmail,
 storeName: storeConfig.name,
 storeSlug,
 orderTotal: Number(conv.order_total),
 currency: (conv.currency as string) || "USD",
 productName,
 orderId: conv.order_id as string,
 timestamp: conv.timestamp instanceof Date ? (conv.timestamp as Date).toISOString() : conv.timestamp as string,
 });
 await sql`UPDATE conversions SET sale_email_sent = true WHERE conversion_id = ${conversionId}`.catch(() => {});
 return true;
}

// GET /api/admin/conversions/[id] — candidate clicks for matching
export async function GET(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

 const sql = neon(dbUrl);

 // Get the conversion
 const convRows = await sql`SELECT * FROM conversions WHERE conversion_id = ${id} LIMIT 1`;
 if (convRows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const conv = convRows[0];

 const ts = conv.timestamp instanceof Date ? conv.timestamp : new Date(conv.timestamp as string);
 const windowStart = new Date(ts.getTime() - 48 * 60 * 60 * 1000).toISOString();
 const windowEnd = new Date(ts.getTime() + 6 * 60 * 60 * 1000).toISOString();

 // Candidate clicks: same store, within 48h before + 6h after the order.
 // Also check if the clicked product is still in inventory — if it's gone, that's
 // a strong signal the click led to the purchase (product sold out after click).
 const clicks = await sql`
 SELECT
 cl.*,
 u.email AS user_email,
 u.name AS user_name,
 (p.id IS NOT NULL) AS product_still_exists
 FROM clicks cl
 LEFT JOIN users u ON u.id::text = cl.user_id
 LEFT JOIN products p ON p.store_slug = cl.store_slug
 AND LOWER(p.title) = LOWER(cl.product_name)
 WHERE cl.store_slug = ${conv.store_slug as string}
 AND cl.timestamp BETWEEN ${windowStart} AND ${windowEnd}
 ORDER BY
 -- Prioritise: product gone from inventory (likely sold) + closest in time
 (p.id IS NULL) DESC,
 ABS(EXTRACT(EPOCH FROM (cl.timestamp - ${ts.toISOString()}::timestamptz))) ASC
 LIMIT 50
 `;

 // If the conversion is already matched to a user, also fetch all their clicks at
 // this store (no time window) so we can find the product name even if the click
 // was outside the ±48h window or the product is already sold/removed.
 const userId = conv.user_id as string | null;
 const userClicks = userId ? await sql`
 SELECT
 cl.*,
 u.email AS user_email,
 u.name AS user_name,
 (p.id IS NOT NULL) AS product_still_exists
 FROM clicks cl
 LEFT JOIN users u ON u.id::text = cl.user_id
 LEFT JOIN products p ON p.store_slug = cl.store_slug
 AND LOWER(p.title) = LOWER(cl.product_name)
 WHERE cl.user_id = ${userId}
 AND cl.store_slug = ${conv.store_slug as string}
 ORDER BY
 ABS(EXTRACT(EPOCH FROM (cl.timestamp - ${ts.toISOString()}::timestamptz))) ASC
 LIMIT 30
 ` : [];

 const mapClick = (c: Record<string, unknown>) => ({
 clickId: c.click_id,
 timestamp: c.timestamp instanceof Date ? (c.timestamp as Date).toISOString() : c.timestamp,
 productName: c.product_name,
 storeSlug: c.store_slug,
 userId: c.user_id ?? null,
 userEmail: c.user_email ?? null,
 userName: c.user_name ?? null,
 productSoldOut: !c.product_still_exists,
 });

 // Other line items from the same order (strips trailing -N suffix to find siblings)
 const baseOrderId = (conv.order_id as string).replace(/-\d+$/, "");
 const sameOrderSiblings = await sql`
 SELECT conversion_id, order_id, order_total, currency, timestamp, matched_click_data, items
 FROM conversions
 WHERE order_id LIKE ${baseOrderId + "%"}
 AND conversion_id != ${id}
 ORDER BY order_id ASC
 LIMIT 10
 `;

 // Other conversions from this store within ±7 days — helps identify sold-out items by context
 const nearbyOrders = await sql`
 SELECT conversion_id, order_id, order_total, currency, timestamp, matched_click_data, items
 FROM conversions
 WHERE store_slug = ${conv.store_slug as string}
 AND conversion_id != ${id}
 AND timestamp BETWEEN ${new Date(ts.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()}
 AND ${new Date(ts.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()}
 ORDER BY ABS(EXTRACT(EPOCH FROM (timestamp - ${ts.toISOString()}::timestamptz))) ASC
 LIMIT 15
 `;

 const mapOrder = (o: Record<string, unknown>) => ({
 conversionId: o.conversion_id,
 orderId: o.order_id,
 orderTotal: o.order_total,
 currency: o.currency,
 timestamp: o.timestamp instanceof Date ? (o.timestamp as Date).toISOString() : o.timestamp,
 productName: (o.matched_click_data as { productName?: string } | null)?.productName
 ?? (Array.isArray(o.items) ? (o.items as { productName?: string }[]).map(i => i.productName).filter(Boolean).join(", ") : null)
 ?? null,
 });

 return NextResponse.json({
 clicks: clicks.map(mapClick),
 userClicks: userClicks.map(mapClick),
 sameOrderSiblings: sameOrderSiblings.map(mapOrder),
 nearbyOrders: nearbyOrders.map(mapOrder),
 });
}

// POST /api/admin/conversions/[id] — manually match to a click or user
export async function POST(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

 const { clickId, userId, userEmail } = await request.json();
 const sql = neon(dbUrl);

 // Resolve userEmail to userId if needed
 let resolvedUserId = userId;
 if (!resolvedUserId && userEmail) {
 const userRows = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${userEmail}) LIMIT 1`;
 resolvedUserId = userRows[0]?.id ? String(userRows[0].id) : null;
 if (!resolvedUserId) return NextResponse.json({ error: "No user found with that email" }, { status: 404 });
 }

 if (clickId) {
 const clickRows = await sql`SELECT * FROM clicks WHERE click_id = ${clickId} LIMIT 1`;
 if (clickRows.length === 0) return NextResponse.json({ error: "Click not found" }, { status: 404 });
 const click = clickRows[0];

 const matchedClickData = {
 clickId: click.click_id,
 clickTimestamp: click.timestamp instanceof Date ? click.timestamp.toISOString() : click.timestamp,
 productName: click.product_name,
 source: "admin-manual",
 };

 await sql`
 UPDATE conversions SET
 matched = true,
 via_click_id = ${clickId},
 user_id = COALESCE(user_id, ${resolvedUserId ?? click.user_id ?? null}),
 matched_click_data = ${JSON.stringify(matchedClickData)}
 WHERE conversion_id = ${id}
 `;
 } else if (resolvedUserId) {
 // Match to a user without a specific click
 await sql`
 UPDATE conversions SET
 user_id = ${resolvedUserId},
 matched = true,
 matched_click_data = ${JSON.stringify({ source: "admin-manual-user", userId: resolvedUserId })}
 WHERE conversion_id = ${id}
 `;
 } else {
 return NextResponse.json({ error: "Provide clickId, userId, or userEmail" }, { status: 400 });
 }

 // Email is NOT sent automatically on match — it only goes out when the admin
 // clicks "Send store notification" (the send_email action below).
 return NextResponse.json({ ok: true });
}

// PUT — update order total
export async function PUT(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const { orderTotal } = await request.json();
 if (!orderTotal || isNaN(Number(orderTotal))) {
 return NextResponse.json({ error: "Valid orderTotal required" }, { status: 400 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

 const sql = neon(dbUrl);
 await sql`UPDATE conversions SET order_total = ${Number(orderTotal)} WHERE conversion_id = ${id}`;

 return NextResponse.json({ ok: true });
}

// PATCH — unmatch a conversion OR mark it as returned
// Body: {} = unmatch, { action: "return" } = mark returned, { action: "unreturn" } = undo return
export async function PATCH(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

 const sql = neon(dbUrl);
 await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS returned BOOLEAN DEFAULT FALSE`.catch(() => {});
 await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ`.catch(() => {});

 const body = await request.json().catch(() => ({}));

 if (body.action === "return") {
 await sql`
 UPDATE conversions SET returned = true, returned_at = NOW()
 WHERE conversion_id = ${id}
 `;
 } else if (body.action === "unreturn") {
 await sql`
 UPDATE conversions SET returned = false, returned_at = NULL
 WHERE conversion_id = ${id}
 `;
 } else if (body.action === "update_items" && Array.isArray(body.items)) {
 await sql`
 UPDATE conversions SET items = ${JSON.stringify(body.items)}
 WHERE conversion_id = ${id}
 `;
 } else if (body.action === "set_product" && typeof body.productName === "string") {
 await sql`
 UPDATE conversions
 SET matched_click_data = COALESCE(matched_click_data, '{}'::jsonb) || ${JSON.stringify({ productName: body.productName })}::jsonb
 WHERE conversion_id = ${id}
 `;
 // No email here — it only sends from the "Send store notification" action below.
 return NextResponse.json({ ok: true });
 } else if (body.action === "send_email") {
 // Manual resend — force=true bypasses the already-sent guard
 let emailSent = false;
 let emailError: string | null = null;
 try {
 emailSent = await trySendStoreSaleEmail(dbUrl, id, { force: true });
 } catch (err) {
 emailError = String(err);
 console.error("[send_email] Failed to send store sale email:", err);
 }
 return NextResponse.json({ ok: true, emailSent, emailError });
 } else {
 await sql`
 UPDATE conversions SET
 matched = false, via_click_id = NULL, matched_click_data = NULL
 WHERE conversion_id = ${id}
 `;
 }

 return NextResponse.json({ ok: true });
}

// DELETE — permanently delete a conversion record
export async function DELETE(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

 const sql = neon(dbUrl);
 // Grab the order_id + store before deleting so we can tombstone it — otherwise the
 // next Carroll/Nello/Square re-sync (or a replayed webhook) re-creates the row.
 const rows = await sql`SELECT order_id, store_slug FROM conversions WHERE conversion_id = ${id} LIMIT 1`;
 await sql`DELETE FROM conversions WHERE conversion_id = ${id}`;
 if (rows.length > 0 && rows[0].order_id) {
 await suppressConversion(String(rows[0].order_id), String(rows[0].store_slug ?? ""));
 }

 return NextResponse.json({ ok: true });
}
