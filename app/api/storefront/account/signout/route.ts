import { NextResponse } from "next/server";
import { SHOPPER_COOKIE, shopperCookieOptions } from "@/app/lib/shopper-session";

/** POST — end this shopper's session at this store. Only this store: the cookie is host-scoped. */
export const dynamic = "force-dynamic";

export async function POST() {
 const res = NextResponse.json({ ok: true });
 // Cleared with the same options it was set with, or the browser keeps the original.
 res.cookies.set(SHOPPER_COOKIE, "", { ...shopperCookieOptions(), maxAge: 0 });
 return res;
}
