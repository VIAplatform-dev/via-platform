import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { convertCurrencyToUSD, refreshExchangeRates } from "@/app/lib/stores";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const crypto = require("crypto");
 const token = request.cookies.get("via_admin_token")?.value;
 return token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

/**
 * GET: preview: show how many rows would be updated and their current vs converted amounts
 * POST: execute: convert all non-USD order_totals to USD in place
 */
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

 const rows = await sql`
 SELECT conversion_id, store_slug, order_total, currency, timestamp
 FROM conversions
 WHERE currency != 'USD' AND order_total > 0
 ORDER BY timestamp DESC
 `;

 await refreshExchangeRates();

 const preview = rows.map((r) => ({
 conversionId: r.conversion_id,
 storeSlug: r.store_slug,
 originalAmount: Number(r.order_total),
 originalCurrency: r.currency,
 convertedUSD: convertCurrencyToUSD(Number(r.order_total), r.currency as string),
 timestamp: r.timestamp,
 }));

 const byCurrency: Record<string, number> = {};
 for (const r of rows) {
 const c = r.currency as string;
 byCurrency[c] = (byCurrency[c] ?? 0) + 1;
 }

 return NextResponse.json({ totalRows: rows.length, byCurrency, preview });
}

export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

 // Fetch live rates once before converting
 await refreshExchangeRates();

 const rows = await sql`
 SELECT conversion_id, order_total, currency
 FROM conversions
 WHERE currency != 'USD' AND order_total > 0
 `;

 if (rows.length === 0) {
 return NextResponse.json({ message: "Nothing to convert: all rows are already USD.", updated: 0 });
 }

 let updated = 0;
 const errors: string[] = [];

 for (const row of rows) {
 const localAmount = Number(row.order_total);
 const currency = row.currency as string;
 const usdAmount = convertCurrencyToUSD(localAmount, currency);

 try {
 await sql`
 UPDATE conversions
 SET order_total = ${usdAmount}, currency = 'USD'
 WHERE conversion_id = ${row.conversion_id as string}
 `;
 updated++;
 } catch (err) {
 errors.push(`${row.conversion_id}: ${err}`);
 }
 }

 return NextResponse.json({
 message: `Converted ${updated} conversion records to USD.`,
 updated,
 errors: errors.length > 0 ? errors : undefined,
 });
}
