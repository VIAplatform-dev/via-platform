import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { actingSeller } from "@/app/lib/market/auth";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { computeReadiness } from "@/app/lib/market/readiness-core";

export const dynamic = "force-dynamic";

// GET — the Market Setup checklist.
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 const [items, pay, legacy] = await Promise.all([
 sql`SELECT id, status, price_cents, images, variants, source, cost_cents, size FROM items WHERE seller_id = ${acting.seller.id} AND (status IN ('active','draft') OR source = 'market')` as Promise<Array<Record<string, unknown>>>,
 getSellerPayments(acting.slug).catch(() => null),
 (sql`SELECT count(*)::int AS n FROM products WHERE store_slug = ${acting.slug}`.catch(() => [{ n: 0 }])) as Promise<Array<{ n: number }>>,
 ]);
 const r = computeReadiness({
 chargesEnabled: Boolean(pay?.chargesEnabled),
 items: items.map((i) => ({ id: String(i.id), status: String(i.status), priceCents: Number(i.price_cents) || 0, images: Array.isArray(i.images) ? (i.images as string[]) : [], variants: Array.isArray(i.variants) ? (i.variants as unknown[]) : [], source: (i.source as string) ?? "manual", costCents: i.cost_cents == null ? null : Number(i.cost_cents), size: (i.size as string) ?? null })),
 legacyProductCount: legacy[0]?.n ?? 0,
 });
 return NextResponse.json(r);
}
