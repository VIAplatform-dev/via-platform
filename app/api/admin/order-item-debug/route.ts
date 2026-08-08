import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

function isAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  if (request.headers.get("authorization") === `Bearer ${adminPassword}`) return true;
  const token = request.cookies.get("via_admin_token")?.value;
  return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

// GET /api/admin/order-item-debug?orderId=collabs-commission-17743594&store=vintage-girlfriend&windowDays=21
// Identifies the real item behind a Collabs commission WITHOUT relying on Collabs:
//   1. the stored conversion row (order_total may be a back-calc estimate, not a real price)
//   2. the buyer's click it was attributed to (the product they actually clicked through on)
//   3. the store's real sold_items removals around the order time (true LISTED prices)
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orderId = request.nextUrl.searchParams.get("orderId");
  const store = request.nextUrl.searchParams.get("store");
  const windowDaysRaw = parseInt(request.nextUrl.searchParams.get("windowDays") ?? "21", 10);
  const windowDays = Number.isFinite(windowDaysRaw) ? Math.min(Math.max(windowDaysRaw, 1), 120) : 21;
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
  const sql = neon(dbUrl);

  // 1. The conversion row for this order. (Branch the whole query — the Neon HTTP driver
  //    doesn't compose partial sql`` fragments.)
  const convRows = store
    ? await sql`
        SELECT conversion_id, timestamp, order_id, order_total, currency, items, via_click_id,
               store_slug, store_name, customer_email
        FROM conversions
        WHERE order_id = ${orderId} AND store_slug = ${store}
        LIMIT 1
      `
    : await sql`
        SELECT conversion_id, timestamp, order_id, order_total, currency, items, via_click_id,
               store_slug, store_name, customer_email
        FROM conversions
        WHERE order_id = ${orderId}
        LIMIT 1
      `;
  const conversion = convRows[0] ?? null;
  if (!conversion) {
    return NextResponse.json({ orderId, found: false, note: "No conversion row for this order_id." });
  }
  // The Collabs revenue sync sometimes writes conversions under a slug that differs from the
  // catalog slug (e.g. "vintage-girlfriend-luxury" vs "vintage-girlfriend"), which breaks the
  // sold_items join. Allow an explicit override so we can search removals under the real catalog slug.
  const removalsStore =
    request.nextUrl.searchParams.get("removalsStore") || (conversion.store_slug as string) || store || "";
  const storeSlug = (conversion.store_slug as string) || store || "";
  const ts = conversion.timestamp as string;

  // 2. The click this conversion was attributed to (what the buyer actually clicked through on).
  let click: Record<string, unknown> | null = null;
  if (conversion.via_click_id) {
    const clickRows = await sql`
      SELECT click_id, timestamp, product_id, product_name, external_url, cart_items
      FROM clicks WHERE click_id = ${conversion.via_click_id as string} LIMIT 1
    `;
    click = clickRows[0] ?? null;
  }

  // 3. Real removals for this store around the order time — the piece that sold dropped off the
  //    feed on the next resync and was captured here with its true LISTED price.
  const removals = removalsStore
    ? await sql`
        SELECT title, final_price, original_price, currency, size, sold_at, image, confirmed,
               click_count, favorite_count
        FROM sold_items
        WHERE store_slug = ${removalsStore}
          AND sold_at BETWEEN (${ts}::timestamptz - (${windowDays} || ' days')::interval)
                          AND (${ts}::timestamptz + (${windowDays} || ' days')::interval)
        ORDER BY sold_at DESC
        LIMIT 200
      `
    : [];

  return NextResponse.json({
    orderId,
    found: true,
    conversion: {
      timestamp: ts,
      orderTotalUsd: conversion.order_total,
      orderTotalIsEstimate:
        "See sync-collabs-revenue: when Collabs returns no line-item price, order_total is back-calculated as commission ÷ tier rate and CAN be on the wrong tier. Trust sold_items prices below over this number.",
      currency: conversion.currency,
      items: conversion.items,
      customerEmail: conversion.customer_email,
      viaClickId: conversion.via_click_id,
      storeSlug,
    },
    clickedProduct: click
      ? {
          productName: click.product_name,
          productId: click.product_id,
          externalUrl: click.external_url,
          cartItems: click.cart_items ?? null,
          clickedAt: click.timestamp,
        }
      : null,
    removalsStore,
    removalsWindowDays: windowDays,
    removalsCount: removals.length,
    removals,
  });
}
