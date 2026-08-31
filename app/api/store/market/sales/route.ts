import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession, getSession } from "@/app/lib/market/sessions-db";
import { listMarketOrders } from "@/app/lib/db/orders";
import { summarizeSales } from "@/app/lib/market/sales-core";

export const dynamic = "force-dynamic";

// GET — this session's in-person sales + totals.
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const wanted = request.nextUrl.searchParams.get("session");
 const session = wanted ? await getSession(acting.seller.id, wanted) : await getOrOpenSession(acting.seller.id);
 if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const orders = await listMarketOrders(acting.seller.id, session.id);
 return NextResponse.json({ session, orders, summary: summarizeSales(orders) });
}
