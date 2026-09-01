import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "./storeAuth";
import { markCrossListing, platformByKey } from "./cross-listing-db";

// The two endpoints every extension-mode marketplace needs, written once.
//
// Queueing and marking-listed differ between Depop and Vestiaire by exactly one string: the platform
// key. Copying twenty lines per marketplace is how the third one ends up subtly different from the
// first — so both call these, and a new marketplace is a three-line route file.

/**
 * Record that the seller means to list this piece here.
 *
 * The listing itself happens in her own browser through the extension; this only flips the board to
 * "Queued" so the intent survives a reload. Idempotent, so re-queueing is harmless.
 */
export async function queueForPlatform(request: NextRequest, platform: string): Promise<NextResponse> {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });
 if (!platformByKey(platform)) return NextResponse.json({ error: "Unknown marketplace." }, { status: 400 });

 const body = await request.json().catch(() => null);
 const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
 if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

 await markCrossListing(slug, itemId, platform, "pending").catch(() => {});
 return NextResponse.json({ ok: true });
}

/**
 * The extension reporting back that the seller actually posted it.
 *
 * The URL is optional because not every site shows one at the moment of posting — a listing with no
 * link recorded is still listed, and pretending otherwise would leave the board permanently wrong.
 */
export async function markListedOnPlatform(request: NextRequest, platform: string): Promise<NextResponse> {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });
 if (!platformByKey(platform)) return NextResponse.json({ error: "Unknown marketplace." }, { status: 400 });

 const body = await request.json().catch(() => null);
 const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
 if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
 const url = typeof body?.url === "string" && /^https?:\/\//.test(body.url) ? body.url.slice(0, 500) : null;

 await markCrossListing(slug, itemId, platform, "listed", url).catch(() => {});
 return NextResponse.json({ ok: true });
}
