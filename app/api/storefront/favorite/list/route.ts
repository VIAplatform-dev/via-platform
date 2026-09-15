import { NextRequest, NextResponse } from "next/server";
import { getShopperFavorites } from "@/app/lib/store-favorites-db";
import { shopperEmail } from "../route";

export const dynamic = "force-dynamic";

function withCors(req: NextRequest, res: NextResponse): NextResponse {
 res.headers.set("Access-Control-Allow-Origin", req.headers.get("origin") || "*");
 res.headers.set("Access-Control-Allow-Credentials", "true");
 res.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
 res.headers.set("Access-Control-Allow-Headers", "Content-Type");
 return res;
}

export async function OPTIONS(req: NextRequest) {
 return withCors(req, new NextResponse(null, { status: 204 }));
}

// GET ?slug= the signed-in shopper's saved pieces at this store.
//
// `signedIn` is the whole point of the answer, not a detail of it: the storefront draws a different
// drawer for somebody who has no list yet and somebody who has not said who they are. Both have an
// empty `favorites`, and telling a signed-out shopper "nothing saved yet" would be a dead end with
// no way out of it.
export async function GET(req: NextRequest) {
 const slug = req.nextUrl.searchParams.get("slug") || "";
 if (!slug) return withCors(req, NextResponse.json({ error: "slug required" }, { status: 400 }));
 const email = shopperEmail(req, slug);
 if (!email) return withCors(req, NextResponse.json({ ok: true, signedIn: false, favorites: [] }));
 const favorites = await getShopperFavorites(slug, email);
 return withCors(req, NextResponse.json({ ok: true, signedIn: true, favorites }));
}
