import { NextResponse } from "next/server";
import { saveConversion } from "@/app/lib/analytics-db";
import { SQUARE_STORES } from "@/app/lib/storeConfig";
import { stores } from "@/app/lib/stores";
import { neon } from "@neondatabase/serverless";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { storeSlug, since } = body as { storeSlug: string; since?: string };

    if (!storeSlug) {
      return NextResponse.json({ error: "storeSlug is required" }, { status: 400 });
    }

    const storeConfig = SQUARE_STORES.find((s) => s.slug === storeSlug);
    if (!storeConfig) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const accessToken = process.env[storeConfig.accessTokenEnvVar ?? "SQUARE_ACCESS_TOKEN"];
    if (!accessToken) {
      return NextResponse.json({ error: `${storeConfig.accessTokenEnvVar} env var not set` }, { status: 500 });
    }

    const storeInfo = stores.find((s) => s.slug === storeSlug);
    const storeName = storeInfo?.name ?? storeSlug;

    // Default: look back 7 days if no since param
    const cutoff = since
      ? new Date(since).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch orders from the Square Orders API. Include OPEN as well as COMPLETED: a Square Online
    // sale is captured/paid but sits in OPEN until the seller fulfils it, so COMPLETED-only misses
    // real recent orders. saveConversion is idempotent on the order id, so an order later moving
    // OPEN → COMPLETED won't double-count.
    const searchBody: Record<string, unknown> = {
      query: {
        filter: {
          state_filter: { states: ["OPEN", "COMPLETED"] },
          date_time_filter: {
            updated_at: { start_at: cutoff },
          },
        },
        sort: { sort_field: "UPDATED_AT", sort_order: "DESC" },
      },
      limit: 200,
    };
    if (storeConfig.locationId) {
      searchBody.location_ids = [storeConfig.locationId];
    }

    const res = await fetch("https://connect.squareup.com/v2/orders/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-01-18",
      },
      body: JSON.stringify(searchBody),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Square API error ${res.status}: ${err}` }, { status: 500 });
    }

    const data = await res.json() as {
      orders?: Array<{
        id: string;
        state: string;
        location_id: string;
        created_at: string;
        updated_at: string;
        total_money?: { amount: number; currency: string };
        net_amount_due_money?: { amount: number; currency: string };
        line_items?: Array<{
          name: string;
          quantity: string;
          base_price_money?: { amount: number; currency: string };
        }>;
      }>;
    };

    const orders = data.orders ?? [];

    // Look up recent VIA clicks for attribution
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const sql = dbUrl ? neon(dbUrl) : null;

    let saved = 0;
    let duplicates = 0;
    let errors = 0;

    for (const order of orders) {
      const currency = order.total_money?.currency ?? "USD";
      const orderTotal = (order.total_money?.amount ?? 0) / 100;
      if (orderTotal <= 0) continue;
      // Skip OPEN orders that still owe a balance (unpaid invoices/holds), only record paid sales.
      if ((order.net_amount_due_money?.amount ?? 0) > 0) continue;

      const items = (order.line_items ?? []).map((li) => ({
        productName: li.name,
        quantity: parseFloat(li.quantity ?? "1"),
        price: (li.base_price_money?.amount ?? 0) / 100,
      }));

      // Try to match to a VIA click within 24h before the order
      type ClickRow = { click_id: string; timestamp: unknown; product_name: string };
      let matchedClick: ClickRow | null = null;
      if (sql) {
        try {
          const orderTime = new Date(order.created_at);
          const clickCutoff = new Date(orderTime.getTime() - 24 * 60 * 60 * 1000).toISOString();
          const rows = await sql`
            SELECT click_id, timestamp, product_name
            FROM clicks
            WHERE store_slug = ${storeSlug}
              AND timestamp >= ${clickCutoff}
              AND timestamp <= ${orderTime.toISOString()}
            ORDER BY timestamp DESC
            LIMIT 1
          `;
          if (rows.length > 0) matchedClick = rows[0] as ClickRow;
        } catch {}
      }

      try {
        const conversionId = `square-${storeSlug}-${order.id}`;
        const { duplicate } = await saveConversion({
          conversionId,
          timestamp: order.created_at,
          orderId: order.id,
          orderTotal,
          currency,
          items,
          viaClickId: matchedClick ? String(matchedClick.click_id) : null,
          storeSlug,
          storeName,
          matched: !!matchedClick,
          matchedClickData: matchedClick
            ? {
                clickId: String(matchedClick.click_id),
                clickTimestamp:
                  (matchedClick.timestamp as Date)?.toISOString?.() || String(matchedClick.timestamp),
                productName: String(matchedClick.product_name),
              }
            : undefined,
        });
        if (duplicate) duplicates++;
        else saved++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      ordersFound: orders.length,
      saved,
      duplicates,
      errors,
      since: cutoff,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
