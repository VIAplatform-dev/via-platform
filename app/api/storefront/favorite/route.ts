import { NextRequest, NextResponse } from "next/server";
import { toggleFavorite, isFavorited, favoriteCount, resolveStoreItemId } from "@/app/lib/store-favorites-db";
import { recordEvent } from "@/app/lib/analytics-events-db";
import { readShopperToken, SHOPPER_COOKIE } from "@/app/lib/shopper-session";

export const dynamic = "force-dynamic";

// A shopper saving pieces on a store's OWN storefront.
//
// SIGNED IN, OR NOT AT ALL. Saving used to work from an anonymous `via_shopper` cookie. A random
// id, no name attached. That is worse than it sounds for both sides of the shop:
//
//   • For the shopper, a list that lives in one browser's cookie jar is lost the moment they clear
//     it, switch to their phone, or open the shop in a private window. A saved piece is a promise
//     to come back to something, and a promise kept in a place they cannot reach is not one.
//   • For the seller, "eleven people saved this" made of anonymous ids is a number she can do
//     nothing with. Signed in, the same eleven are her customers, in her customer list, and she can
//     tell one of them the piece is about to go.
//
// So the identity here is the store session (vya_store_session): the same magic-link sign-in her
// account panel already offers, scoped to HER store and no other. See shopper-session.ts for why
// that boundary is drawn where it is. The row is keyed by the shopper's email, which is what makes
// a list follow them from a laptop to a phone.
//
// Anonymous browsing is untouched: product VIEWS still record against the anonymous cookie
// (see /api/storefront/track), because counting how many people looked needs no name.
//
// CORS is open + credentialed so this works when the storefront is on the seller's own domain.
function withCors(req: NextRequest, res: NextResponse): NextResponse {
 res.headers.set("Access-Control-Allow-Origin", req.headers.get("origin") || "*");
 res.headers.set("Access-Control-Allow-Credentials", "true");
 res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
 res.headers.set("Access-Control-Allow-Headers", "Content-Type");
 return res;
}

/**
 * Who is saving, at this store. Null when nobody is signed in.
 *
 * The token names the store it was issued for and is refused anywhere else, so a session from one
 * seller's shop cannot save pieces at another's.
 */
export function shopperEmail(req: NextRequest, slug: string): string | null {
 const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
 const token = req.cookies.get(SHOPPER_COOKIE)?.value || "";
 if (!secret || !token) return null;
 return readShopperToken(token, slug, secret)?.email ?? null;
}

/** What the storefront is told when nobody is signed in. A prompt, not an error. */
const SIGN_IN = { ok: false, signedIn: false, code: "sign_in_required", error: "Sign in to save pieces." };

export async function OPTIONS(req: NextRequest) {
 return withCors(req, new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
 const slug = req.nextUrl.searchParams.get("slug") || "";
 const item = req.nextUrl.searchParams.get("item") || "";
 if (!slug || !item) return withCors(req, NextResponse.json({ error: "slug + item required" }, { status: 400 }));
 // `item` is whatever the storefront link carried. An imported handle or a VYA id. Resolved here,
 // against this store, so the table only ever holds real ids. See resolveStoreItemId.
 const itemId = await resolveStoreItemId(slug, item);
 if (!itemId) return withCors(req, NextResponse.json({ ok: true, favorited: false, count: 0 }));
 // The count is not private, it is how many people want the piece, which the page may well show,
 // so a signed-out shopper still gets it. Only whether THEY saved it needs a session.
 const email = shopperEmail(req, slug);
 const [favorited, count] = await Promise.all([
  email ? isFavorited(slug, itemId, email) : Promise.resolve(false),
  favoriteCount(slug, itemId),
 ]);
 return withCors(req, NextResponse.json({ ok: true, signedIn: !!email, favorited, count }));
}

export async function POST(req: NextRequest) {
 const b = await req.json().catch(() => ({}));
 const slug = String(b?.slug || "");
 const item = String(b?.item || "");
 if (!slug || !item) return withCors(req, NextResponse.json({ error: "slug + item required" }, { status: 400 }));

 // 401 BEFORE anything is looked up or written. The storefront turns this into the sign-in panel
 // rather than an error. See wishlist.ts.
 const email = shopperEmail(req, slug);
 if (!email) return withCors(req, NextResponse.json(SIGN_IN, { status: 401 }));

 const itemId = await resolveStoreItemId(slug, item);
 // A stale link in a shopper's tab must not save a piece this store does not have.
 if (!itemId) return withCors(req, NextResponse.json({ error: "That piece isn't available." }, { status: 404 }));
 const r = await toggleFavorite(slug, itemId, email, email);
 // Clean event stream, only the add counts as a favorite signal, not the un-favorite.
 if (r?.favorited) await recordEvent({ type: "favorite", storeSlug: slug, itemId, actorId: email, surface: "storefront" });
 return withCors(req, NextResponse.json({ ok: true, signedIn: true, ...r }));
}
