import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession } from "@/app/lib/market/sessions-db";
import { listBringList } from "@/app/lib/market/inventory-db";

export const dynamic = "force-dynamic";

// GET — the bring list (or everything available, when no list was made) for the printout.
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const session = await getOrOpenSession(acting.seller.id);
 const items = await listBringList(acting.seller.id, session.id);
 return NextResponse.json({ session, items, count: items.length, valueCents: items.reduce((s, i) => s + i.priceCents, 0) });
}
