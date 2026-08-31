import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOpenSession, closeSession } from "@/app/lib/market/sessions-db";
import { listCheckouts } from "@/app/lib/market/checkout-db";

export const dynamic = "force-dynamic";

// POST — close the open session (refused while a checkout is still awaiting payment).
export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const session = await getOpenSession(acting.seller.id);
 if (!session) return NextResponse.json({ ok: true });
 const open = (await listCheckouts(acting.seller.id, session.id, 20)).filter((c) => c.status === "awaiting_payment");
 if (open.length) return NextResponse.json({ error: "Finish or cancel the checkout in progress first." }, { status: 409 });
 await closeSession(session.id, acting.seller.id);
 return NextResponse.json({ ok: true, sessionId: session.id });
}
