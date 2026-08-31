import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOpenSession } from "@/app/lib/market/sessions-db";
import { searchMarketItems } from "@/app/lib/market/inventory-db";

export const dynamic = "force-dynamic";

// GET ?q= — fast manual search over the seller's own items (the always-available fallback).
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = request.nextUrl.searchParams.get("q") || "";
 const session = await getOpenSession(acting.seller.id);
 const items = await searchMarketItems(acting.seller.id, q, session?.id ?? null);
 return NextResponse.json({ items });
}
