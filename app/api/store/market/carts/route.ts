import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession } from "@/app/lib/market/sessions-db";
import { listOpenCarts, createCart } from "@/app/lib/market/carts-db";

export const dynamic = "force-dynamic";

// GET — every cart still open at this market, oldest first.
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const session = await getOrOpenSession(acting.seller.id);
 const carts = await listOpenCarts(acting.seller.id, session.id);
 return NextResponse.json({ sessionId: session.id, carts });
}

// POST — start a fresh cart for the next customer.
export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const session = await getOrOpenSession(acting.seller.id);
 const cart = await createCart(acting.seller.id, session.id);
 return NextResponse.json({ cart });
}
