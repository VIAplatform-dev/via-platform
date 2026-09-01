import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listVersions, ensureBaseline, snapshotAsDraft, startFreshDesign, publishVersion, renameVersion, deleteVersion } from "@/app/lib/storefront-versions-db";
import { normalizeVersionName } from "@/app/lib/storefront-versions";

export const dynamic = "force-dynamic";

// The seller's storefronts: the one that's live, plus every draft she's kept.
//
// Every action here goes through storefront-versions-db, which preserves the outgoing storefront
// before it changes anything — so nothing in this file can lose a store's site, whatever order the
// seller clicks in.

/** List. Creates the baseline row first, so a store that predates versions still shows its live one. */
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 await ensureBaseline(slug).catch(() => {});
 const versions = await listVersions(slug).catch(() => []);
 return NextResponse.json({ ok: true, versions });
}

/**
 * Create one.
 *   { action: "snapshot", name? }  — keep a copy of what's live now, without changing what's live.
 *   { action: "fresh", keepAs? }   — park the live storefront as a draft and start on a blank design.
 */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const action = String(body?.action || "snapshot");

 if (action === "fresh") {
  const versions = await startFreshDesign(slug, normalizeVersionName(body?.keepAs) || undefined).catch(() => null);
  if (!versions) return NextResponse.json({ error: "Couldn’t start a new design — try again." }, { status: 500 });
  return NextResponse.json({ ok: true, versions });
 }

 const created = await snapshotAsDraft(slug, normalizeVersionName(body?.name) || undefined).catch(() => null);
 if (!created) return NextResponse.json({ error: "Couldn’t save a copy — try again." }, { status: 500 });
 return NextResponse.json({ ok: true, version: created, versions: await listVersions(slug) });
}

/** Publish or rename: { id, action: "publish" } | { id, action: "rename", name }. */
export async function PATCH(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const id = String(body?.id || "");
 if (!id) return NextResponse.json({ error: "Which storefront?" }, { status: 400 });

 if (body?.action === "rename") {
  const name = normalizeVersionName(body?.name);
  if (!name) return NextResponse.json({ error: "Give it a name." }, { status: 400 });
  if (!(await renameVersion(slug, id, name))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, versions: await listVersions(slug) });
 }

 if (!(await publishVersion(slug, id).catch(() => false))) {
  return NextResponse.json({ error: "Couldn’t publish that storefront — try again." }, { status: 500 });
 }
 return NextResponse.json({ ok: true, versions: await listVersions(slug) });
}

/** Delete a draft. The live one is refused — publish something else first. */
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const id = new URL(request.url).searchParams.get("id") || "";
 if (!id) return NextResponse.json({ error: "Which storefront?" }, { status: 400 });
 if (!(await deleteVersion(slug, id))) {
  return NextResponse.json({ error: "That’s your live storefront — publish another one first." }, { status: 400 });
 }
 return NextResponse.json({ ok: true, versions: await listVersions(slug) });
}
