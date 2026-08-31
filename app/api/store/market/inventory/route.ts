import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession } from "@/app/lib/market/sessions-db";
import { listAvailableAtMarket, listSoldAtMarket } from "@/app/lib/market/inventory-db";

export const dynamic = "force-dynamic";

// GET ?view=available|sold — what's at this market.
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const session = await getOrOpenSession(acting.seller.id);
 const view = request.nextUrl.searchParams.get("view") === "sold" ? "sold" : "available";
 const items = view === "sold" ? await listSoldAtMarket(acting.seller.id, session.id) : await listAvailableAtMarket(acting.seller.id, session.id);
 return NextResponse.json({ view, sessionId: session.id, items });
}
