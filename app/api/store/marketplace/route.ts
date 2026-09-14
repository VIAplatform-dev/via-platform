import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getMarketplaceOptIn, setMarketplaceOptIn } from "@/app/lib/marketplace-optin-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

// Whether this store's pieces appear on the VYA marketplace (vyaplatform.com).
//
// Separate from every cross-listing route: nothing is posted anywhere. This only says whether the
// marketplace may READ the pieces she already has on VYA. See app/lib/marketplace-optin.ts.

async function livePieceCount(storeSlug: string): Promise<number> {
 try {
  const seller = await getSellerBySlug(storeSlug);
  if (!seller?.id) return 0;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return 0;
  const rows = (await neon(url)`SELECT count(*)::int AS n FROM items WHERE seller_id = ${seller.id} AND status = 'active'`) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
 } catch {
  return 0;
 }
}

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [optIn, livePieces] = await Promise.all([getMarketplaceOptIn(slug), livePieceCount(slug)]);
 return NextResponse.json({ ok: true, ...optIn, livePieces });
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (typeof body?.listed !== "boolean") return NextResponse.json({ error: "Say listed: true or false." }, { status: 400 });
 const optIn = await setMarketplaceOptIn(slug, body.listed);
 return NextResponse.json({ ok: true, ...optIn, livePieces: await livePieceCount(slug) });
}
