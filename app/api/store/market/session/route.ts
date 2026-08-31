import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOrOpenSession, renameSession, listSessions } from "@/app/lib/market/sessions-db";

export const dynamic = "force-dynamic";

// GET — the open session (opened on demand) + recent history. POST { name } — rename the open session.
export async function GET(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const session = await getOrOpenSession(acting.seller.id);
 const history = await listSessions(acting.seller.id, 10);
 return NextResponse.json({ session, history });
}

export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const name = String(body?.name || "").trim();
 if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
 const session = await getOrOpenSession(acting.seller.id, name);
 if (session.name !== name) await renameSession(session.id, acting.seller.id, name);
 return NextResponse.json({ ok: true, session: { ...session, name } });
}
