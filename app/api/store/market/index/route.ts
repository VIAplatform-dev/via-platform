import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { indexStatus, indexItems } from "@/app/lib/market/embeddings-db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET — how much of this store's inventory the camera can find. POST — index a batch now.
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json(await indexStatus(acting.seller.id));
}

export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const r = await indexItems(acting.seller.id, 48);
 return NextResponse.json({ ok: true, ...r, status: await indexStatus(acting.seller.id) });
}
