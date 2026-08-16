import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { parseOrders } from "@/app/lib/parse-orders";
import { importOrders, reconcileSoldItemsWithOrders } from "@/app/lib/imported-orders-db";

// POST { csv, source? } — bring over a store's historical orders (accounting/LTV/repeat-
// customer history). Accepts a Shopify/Square/spreadsheet order export; Shopify's multi-row
// orders are grouped by order id. Stored in imported_orders (separate from live orders — no
// item FK, never touches checkout/payouts). Idempotent by order id.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const csv = typeof body?.csv === "string" ? body.csv : "";
 const source = typeof body?.source === "string" ? body.source.slice(0, 40) : "csv";
 if (!csv.trim()) return NextResponse.json({ error: "Paste or upload your order history first." }, { status: 400 });

 const parsed = parseOrders(csv);
 if (!parsed.length) {
 return NextResponse.json({ error: "Couldn’t read any orders — make sure your file has a header row with an order total column." }, { status: 400 });
 }

 const { added, total } = await importOrders(slug, parsed, source);
 // Drop any scraped sold-out items this order history already covers, so the same past sale
 // isn't counted twice (once as a phantom `sold` item, once as an imported order).
 const reconciled = await reconcileSoldItemsWithOrders(slug).catch(() => 0);
 return NextResponse.json({ ok: true, found: total, added, reconciled });
}
