import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { logActivity } from "@/app/lib/seller-activity-db";

export const dynamic = "force-dynamic";

// POST { path } — the seller opened a screen.
//
// Recorded server-side from a beacon rather than trusted from an analytics SDK: this is the log you
// look at when one store is trying VYA and something went wrong, so it has to survive an ad blocker,
// a locked-down browser and a dropped third-party script. Answers 204 always — a log that can fail
// loudly is a log that interrupts the thing it's watching.
export async function POST(request: NextRequest) {
 try {
  const slug = await resolveStoreSlugAny(request);
  const session = await auth().catch(() => null);
  const email = session?.user?.email ?? null;
  if (!slug && !email) return new NextResponse(null, { status: 204 });

  const body = await request.json().catch(() => null);
  const path = String(body?.path || "").slice(0, 200);
  if (!path.startsWith("/admin")) return new NextResponse(null, { status: 204 });

  logActivity({ storeSlug: slug, email, kind: "viewed", detail: path });
 } catch { /* never interrupt */ }
 return new NextResponse(null, { status: 204 });
}
