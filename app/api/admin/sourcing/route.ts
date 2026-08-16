import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { findFlips } from "@/app/lib/sourcing";
import { isEbayConfigured } from "@/app/lib/data-layer/ebay";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 if (request.headers.get("authorization") === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

// Sourcing flip-finder (Phase 1, eBay Browse). Read-only: searches active listings for ?q= and
// flags ones priced >= ?minMargin% below the market median. Uses the app OAuth token (no seller
// consent) — nothing here creates or writes anything.
//   /api/admin/sourcing?q=Fendi%20Baguette&minMargin=30&limit=100
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isEbayConfigured()) return NextResponse.json({ error: "eBay app keys (EBAY_CLIENT_ID/SECRET) aren’t set." }, { status: 503 });

 const q = request.nextUrl.searchParams.get("q");
 if (!q || !q.trim()) return NextResponse.json({ error: "Pass a search, e.g. ?q=Fendi%20Baguette" }, { status: 400 });

 const minMargin = Math.max(0, Math.min(90, Number(request.nextUrl.searchParams.get("minMargin") ?? 25)));
 const limit = Math.max(1, Math.min(200, Number(request.nextUrl.searchParams.get("limit") ?? 50)));
 const type = request.nextUrl.searchParams.get("type") ?? undefined; // optional cluster override (e.g. Bag)

 const result = await findFlips(q.trim(), { minMarginPct: minMargin, limit, type });
 return NextResponse.json(result);
}
