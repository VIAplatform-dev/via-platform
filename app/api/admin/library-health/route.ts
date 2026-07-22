import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { getLibraryHealth } from "@/app/lib/training-data-db";

export const dynamic = "force-dynamic";

// The reference-library health check: how big it is, how fast it's GROWING (new examples in the
// last 7/30 days), and — for the un-embeddable rows — what they are (source, store, age) so you can
// tell stale/sold junk from live listings worth re-syncing. Read-only.
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 return NextResponse.json({ ok: true, ...(await getLibraryHealth()) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
