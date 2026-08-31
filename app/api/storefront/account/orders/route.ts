import { NextRequest, NextResponse } from "next/server";
import { resolveStore } from "@/app/lib/plan-b/cart-session";
import { readShopperToken, SHOPPER_COOKIE } from "@/app/lib/shopper-session";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listOrdersForShopper } from "@/app/lib/db/orders";
import { shopperOrderView } from "@/app/lib/shopper-orders";

/**
 * GET — the signed-in shopper's own orders at THIS store.
 *
 * Both halves of the key come from things the caller cannot choose: the store from the host, the
 * shopper from a signed cookie that is valid for this store only. Nothing in the request names
 * whose orders to return, so there is nothing to tamper with.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return NextResponse.json({ error: "Unknown store." }, { status: 404 });

 const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
 const cookie = request.cookies.get(SHOPPER_COOKIE)?.value || "";
 const session = secret && cookie ? readShopperToken(cookie, store.slug, secret) : null;
 // Not signed in is not an error — the panel asks for orders before it knows.
 if (!session) return NextResponse.json({ signedIn: false, orders: [] });

 const seller = await getSellerBySlug(store.slug).catch(() => null);
 if (!seller) return NextResponse.json({ signedIn: true, orders: [] });

 const rows = await listOrdersForShopper(seller.id, session.email).catch(() => []);
 return NextResponse.json({ signedIn: true, email: session.email, orders: shopperOrderView(rows) });
}
