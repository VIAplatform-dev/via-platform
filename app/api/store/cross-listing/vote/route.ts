import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny, isAdminRequest } from "@/app/lib/storeAuth";
import { getVotes, toggleVote, suggest, votablePlatforms, votersByPlatform, allSuggestions } from "@/app/lib/marketplace-votes-db";
import { rankDemand } from "@/app/lib/marketplace-votes";

export const dynamic = "force-dynamic";

// Which marketplace VYA builds next, asked of the shops who would use it.
//
// Under /api/store/cross-listing, so the proxy's existing allowlist entry covers it (it matches on
// prefix). A new top-level path would have 404'd until someone remembered to add it.

/** GET: the coming-soon channels, most-wanted first, with this shop's own votes marked. */
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { counts, mine } = await getVotes(slug).catch(() => ({ counts: {}, mine: [] as string[] }));
 const demand = rankDemand(votablePlatforms(), counts, mine);

 // VYA's own read of the same question, on the same route rather than a new one: who asked for
 // what, and the channels nobody thought to put on the list. A count tells you the order; the
 // names tell you who to call when it ships.
 if (isAdminRequest(request)) {
  const [voters, suggestions] = await Promise.all([
   votersByPlatform().catch(() => ({})),
   allSuggestions().catch(() => []),
  ]);
  return NextResponse.json({ ok: true, demand, admin: { voters, suggestions } });
 }
 return NextResponse.json({ ok: true, demand });
}

/**
 * POST { platform } to turn a vote on or off, or { suggestion } to write one in.
 *
 * Answers with the whole tally either way, so the page never has to guess what its own click did
 * to everyone else's counts.
 */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);

 let matchedKey: string | undefined;
 try {
  if (typeof body?.platform === "string") {
   await toggleVote(slug, body.platform);
  } else if (typeof body?.suggestion === "string") {
   const r = await suggest(slug, body.suggestion);
   if (!r.ok) return NextResponse.json({ error: "Type the name of the marketplace." }, { status: 400 });
   matchedKey = r.matchedKey;
  } else {
   return NextResponse.json({ error: "Nothing to vote on." }, { status: 400 });
  }
 } catch (e) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save that." }, { status: 400 });
 }

 const { counts, mine } = await getVotes(slug).catch(() => ({ counts: {}, mine: [] as string[] }));
 return NextResponse.json({ ok: true, demand: rankDemand(votablePlatforms(), counts, mine), matchedKey });
}
