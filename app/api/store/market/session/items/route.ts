import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession, listSessionItemIds, addSessionItems, removeSessionItems } from "@/app/lib/market/sessions-db";

export const dynamic = "force-dynamic";

const ids = (body: unknown): string[] => (Array.isArray((body as { ids?: unknown })?.ids) ? ((body as { ids: unknown[] }).ids.filter((x) => typeof x === "string") as string[]).slice(0, 2000) : []);

// The bring list: GET ids · POST { ids } add · DELETE { ids } remove.
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const session = await getOrOpenSession(acting.seller.id);
 return NextResponse.json({ sessionId: session.id, ids: await listSessionItemIds(session.id) });
}

export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const session = await getOrOpenSession(acting.seller.id);
 const list = ids(await request.json().catch(() => ({})));
 const added = await addSessionItems(session.id, list);
 return NextResponse.json({ ok: true, added });
}

export async function DELETE(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const session = await getOrOpenSession(acting.seller.id);
 await removeSessionItems(session.id, ids(await request.json().catch(() => ({}))));
 return NextResponse.json({ ok: true });
}
