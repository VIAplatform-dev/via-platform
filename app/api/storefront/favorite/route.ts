import { NextRequest, NextResponse } from "next/server";
import { toggleFavorite, isFavorited, favoriteCount } from "@/app/lib/store-favorites-db";
import { recordEvent } from "@/app/lib/analytics-events-db";

export const dynamic = "force-dynamic";

// A shopper favoriting items on a store's OWN storefront. The shopper is identified by
// a `via_shopper` cookie (set here), so favorites persist for them on that store. CORS
// is open + credentialed so it works when the storefront is on the seller's own domain.
function withCors(req: NextRequest, res: NextResponse): NextResponse {
 res.headers.set("Access-Control-Allow-Origin", req.headers.get("origin") || "*");
 res.headers.set("Access-Control-Allow-Credentials", "true");
 res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
 res.headers.set("Access-Control-Allow-Headers", "Content-Type");
 return res;
}

function shopper(req: NextRequest): { id: string; fresh: boolean } {
 const existing = req.cookies.get("via_shopper")?.value;
 return existing ? { id: existing, fresh: false } : { id: crypto.randomUUID(), fresh: true };
}
function setShopper(res: NextResponse, id: string) {
 res.cookies.set("via_shopper", id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "none", secure: true, httpOnly: true });
}

export async function OPTIONS(req: NextRequest) {
 return withCors(req, new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
 const slug = req.nextUrl.searchParams.get("slug") || "";
 const item = req.nextUrl.searchParams.get("item") || "";
 if (!slug || !item) return withCors(req, NextResponse.json({ error: "slug + item required" }, { status: 400 }));
 const { id, fresh } = shopper(req);
 const [favorited, count] = await Promise.all([isFavorited(slug, item, id), favoriteCount(slug, item)]);
 const res = NextResponse.json({ ok: true, favorited, count });
 if (fresh) setShopper(res, id);
 return withCors(req, res);
}

export async function POST(req: NextRequest) {
 const b = await req.json().catch(() => ({}));
 const slug = String(b?.slug || "");
 const item = String(b?.item || "");
 if (!slug || !item) return withCors(req, NextResponse.json({ error: "slug + item required" }, { status: 400 }));
 const { id, fresh } = shopper(req);
 const r = await toggleFavorite(slug, item, id);
 // Clean event stream — only the add counts as a favorite signal, not the un-favorite.
 if (r?.favorited) await recordEvent({ type: "favorite", storeSlug: slug, itemId: item, actorId: id, surface: "storefront" });
 const res = NextResponse.json({ ok: true, ...r });
 if (fresh) setShopper(res, id);
 return withCors(req, res);
}
