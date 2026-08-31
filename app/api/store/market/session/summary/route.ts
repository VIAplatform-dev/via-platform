import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getSession, getOpenSession } from "@/app/lib/market/sessions-db";
import { listMarketOrders } from "@/app/lib/db/orders";
import { summarizeSales } from "@/app/lib/market/sales-core";
import { listBringList } from "@/app/lib/market/inventory-db";

export const dynamic = "force-dynamic";

// GET ?session= — end-of-day summary for one market (open or closed): totals, cash vs card, what
// sold, what's left of the bring list ("pack it up").
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const wanted = request.nextUrl.searchParams.get("session");
 const session = wanted ? await getSession(acting.seller.id, wanted) : await getOpenSession(acting.seller.id);
 if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const [orders, bring] = await Promise.all([listMarketOrders(acting.seller.id, session.id), listBringList(acting.seller.id, session.id)]);
 const summary = summarizeSales(orders);
 const sold = orders.filter((o) => o.status !== "refunded");
 const byCategory = new Map<string, { count: number; cents: number }>();
 const byBrand = new Map<string, { count: number; cents: number }>();
 for (const o of sold) {
 const c = o.itemCategory || "Other", b = o.itemBrand || "Unbranded";
 byCategory.set(c, { count: (byCategory.get(c)?.count ?? 0) + 1, cents: (byCategory.get(c)?.cents ?? 0) + o.amountCents });
 byBrand.set(b, { count: (byBrand.get(b)?.count ?? 0) + 1, cents: (byBrand.get(b)?.cents ?? 0) + o.amountCents });
 }
 const top = (m: Map<string, { count: number; cents: number }>) => [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.cents - a.cents).slice(0, 5);
 const soldIds = new Set(sold.map((o) => o.itemId));
 const unsold = bring.filter((i) => !soldIds.has(i.id) && (i.status === "active" || i.status === "draft"));
 return NextResponse.json({
 session, summary, orders,
 topCategories: top(byCategory), topBrands: top(byBrand),
 brought: { count: bring.length, valueCents: bring.reduce((s, i) => s + i.priceCents, 0) },
 unsold: { count: unsold.length, valueCents: unsold.reduce((s, i) => s + i.priceCents, 0), items: unsold },
 });
}
