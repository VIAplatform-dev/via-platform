import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { storesForEmail, emailBelongsToStore } from "@/app/lib/store-users-db";
import { chooseStore } from "@/app/lib/store-access-core";
import { stores as CURATED } from "@/app/lib/stores";

export const dynamic = "force-dynamic";

// Which shops this person can reach, and which one she is looking at.
//
// store_users is UNIQUE(store_slug, email), so working at two shops is allowed and always has been.
// What was missing is any way to SEE that: the session resolved to one of them with a SQL LIMIT 1,
// nothing on screen named it, and there was no way to move between them.

export async function GET(request: NextRequest) {
 const session = await auth();
 const email = session?.user?.email ?? null;
 const current = await resolveStoreSlugAny(request);
 if (!email) return NextResponse.json({ ok: true, current, stores: [], shouldAsk: false });

 const mine = await storesForEmail(email).catch(() => []);
 const choice = chooseStore(
  request.nextUrl.searchParams.get("store"),
  request.cookies.get("via_store")?.value ?? null,
  mine.map((m) => m.storeSlug),
 );
 // Real names, so the switcher reads like her shops rather than like slugs.
 const names = new Map(CURATED.map((s) => [s.slug, s.name] as const));
 return NextResponse.json({
  ok: true,
  current: current ?? choice.slug,
  shouldAsk: choice.shouldAsk,
  stores: mine.map((m) => ({ slug: m.storeSlug, name: names.get(m.storeSlug) || m.storeSlug, role: m.role })),
 });
}

// POST { slug } — she picked a shop. Remembered in a cookie so the next page load stays put; the
// membership check runs here AND on every request that reads it, because a cookie is a claim.
export async function POST(request: NextRequest) {
 const session = await auth();
 const email = session?.user?.email ?? null;
 if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({})) as { slug?: unknown };
 const slug = typeof body.slug === "string" ? body.slug.trim() : "";
 if (!slug) return NextResponse.json({ error: "Which shop?" }, { status: 400 });
 if (!(await emailBelongsToStore(slug, email).catch(() => false))) {
  return NextResponse.json({ error: "That isn’t one of your shops." }, { status: 403 });
 }
 const res = NextResponse.json({ ok: true, slug });
 res.cookies.set("via_store", slug, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
 return res;
}
