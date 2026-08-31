import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { listVersions, readVersion, versionsFootprint } from "@/app/lib/capture-versions-db";
import { describeReason } from "@/app/lib/capture-versions-core";

export const dynamic = "force-dynamic";

// Version history for a captured page — the operator's view, which unlike the seller's undo shows
// EVERY version including re-imports and asset rehosting. This is what a broken import is recovered
// from: `site_captures` holds one row per page and every write overwrites it in place.

// GET ?slug=&path=   → that page's versions, newest first
// GET ?footprint=1   → what the history is costing
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = request.nextUrl.searchParams;
 if (q.get("footprint")) {
  const f = await versionsFootprint();
  return NextResponse.json({ ok: true, ...f });
 }
 const slug = (q.get("slug") || "").trim().slice(0, 100);
 const path = (q.get("path") || "").trim().slice(0, 300);
 if (!slug || !path.startsWith("/")) return NextResponse.json({ error: "Need a store and a page path." }, { status: 400 });
 const versions = await listVersions(slug, path);
 return NextResponse.json({ ok: true, slug, path, versions: versions.map((v) => ({ ...v, label: describeReason(v.reason) })) });
}

// POST { id, confirm: true } — put a page back to that version.
//
// A restore is itself a write to `site_captures`, so it goes through the normal save path and leaves
// a version of what it replaced. Undoing a bad restore is therefore the same operation again — there
// is no state this can strand a page in.
export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null); /* allow-swallow: answered with the 400 below */
 const id = String(body?.id ?? "").trim();
 if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Missing version." }, { status: 400 });
 // Restoring overwrites a live page of a seller's storefront. Deliberate and explicit, never a
 // consequence of a stray request.
 if (body?.confirm !== true) return NextResponse.json({ error: "Restoring overwrites the live page — send confirm: true." }, { status: 400 });

 const v = await readVersion(id);
 if (!v) return NextResponse.json({ error: "That version is no longer stored." }, { status: 404 });

 const { restoreCapturePageVersion } = await import("@/app/lib/site-capture-db");
 await restoreCapturePageVersion(v.slug, v.path, v.html);
 return NextResponse.json({ ok: true, slug: v.slug, path: v.path, bytes: v.html.length });
}
