import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { listActivity, listActiveStores } from "@/app/lib/seller-activity-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The VYA owner's view of what a seller has been doing. Owner-only — a store must never be able to
// read another store's log, and has no reason to read its own here.
function isVyaOwner(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 const token = request.cookies.get("via_admin_token")?.value;
 return Boolean(pw && token && token === crypto.createHash("sha256").update(pw).digest("hex"));
}

export async function GET(request: NextRequest) {
 if (!isVyaOwner(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const url = new URL(request.url);
 const store = url.searchParams.get("store");
 const email = url.searchParams.get("email");
 const [events, stores] = await Promise.all([
  listActivity({ storeSlug: store, email, limit: 300 }),
  listActiveStores(),
 ]);
 return NextResponse.json({ ok: true, events, stores });
}
