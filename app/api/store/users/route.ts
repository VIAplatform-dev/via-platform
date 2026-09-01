import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny, isOwner } from "@/app/lib/storeAuth";
import { listStoreUsers, addStoreUser, removeStoreUser } from "@/app/lib/store-users-db";
import { getStoreTier } from "@/app/lib/store-plans-db";
import { canAddSeat, seatsForTier } from "@/app/lib/plans";

export const dynamic = "force-dynamic";

// Who can get into this store's workspace.
//
// Seats are counted including the owner, and the limit comes from the plan (see plans.ts). Two
// rules run through everything here, and both exist because this endpoint controls who can see a
// store's money:
//
//   • OWNER ONLY. Staff can work in the store; they can't hand out access to it.
//   • THE LAST OWNER CAN'T BE REMOVED. A store with no owner is a store nobody can administer, and
//     there is no self-service way back from it.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const [users, tier] = await Promise.all([listStoreUsers(slug), getStoreTier(slug)]);
 const limit = seatsForTier(tier);
 return NextResponse.json({
  ok: true,
  users,
  tier,
  seats: { used: users.length, limit, remaining: Math.max(0, limit - users.length) },
 });
}

/** POST { email, role? } — invite someone into the workspace. */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isOwner(request, slug)) return NextResponse.json({ error: "Only the store owner can add people." }, { status: 403 });

 const body = await request.json().catch(() => null);
 const email = String(body?.email || "").trim().toLowerCase();
 const role = body?.role === "owner" ? "owner" : "staff";
 if (!EMAIL.test(email)) return NextResponse.json({ error: "That doesn’t look like an email address." }, { status: 400 });

 const users = await listStoreUsers(slug);
 // Already here? Say so plainly rather than spending a seat on a duplicate.
 if (users.some((u) => u.email.toLowerCase() === email)) {
  return NextResponse.json({ error: "They’re already on this store." }, { status: 400 });
 }

 const tier = await getStoreTier(slug);
 const room = canAddSeat(tier, users.length);
 if (!room.ok) return NextResponse.json({ error: room.reason, limit: room.limit }, { status: 402 });

 await addStoreUser(slug, email, role);
 const after = await listStoreUsers(slug);
 return NextResponse.json({ ok: true, users: after, seats: { used: after.length, limit: seatsForTier(tier), remaining: Math.max(0, seatsForTier(tier) - after.length) } });
}

/** DELETE ?email= — take someone out of the workspace. */
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isOwner(request, slug)) return NextResponse.json({ error: "Only the store owner can remove people." }, { status: 403 });

 const email = (new URL(request.url).searchParams.get("email") || "").trim().toLowerCase();
 if (!email) return NextResponse.json({ error: "Which person?" }, { status: 400 });

 const users = await listStoreUsers(slug);
 const target = users.find((u) => u.email.toLowerCase() === email);
 if (!target) return NextResponse.json({ error: "They’re not on this store." }, { status: 404 });

 // Removing the last owner leaves a store nobody can administer, with no way back without support.
 if (target.role === "owner" && users.filter((u) => u.role === "owner").length <= 1) {
  return NextResponse.json({ error: "This is the only owner — make someone else an owner first." }, { status: 400 });
 }

 await removeStoreUser(slug, email);
 const after = await listStoreUsers(slug);
 const tier = await getStoreTier(slug);
 return NextResponse.json({ ok: true, users: after, seats: { used: after.length, limit: seatsForTier(tier), remaining: Math.max(0, seatsForTier(tier) - after.length) } });
}
