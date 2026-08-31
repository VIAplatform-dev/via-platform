import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listUndoablePages, undoCapturePageEdit } from "@/app/lib/site-capture-db";

export const dynamic = "force-dynamic";

// ONE STEP BACK on a captured page.
//
// site_captures overwrites a page in place, so until the previous_html column existed an edit was
// permanent. Each save now leaves the version it replaced on the row; this endpoint reads which
// pages have one, and puts a page back. Deliberately one step: after an undo the slot is cleared
// and the button goes away, because that is exactly what we can honestly offer.
//
// Same auth as every other store endpoint — the acting store, and only its own pages.

// GET — which of this store's pages can still be undone (and when their last save was).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const pages = await listUndoablePages(slug).catch(() => []); /* allow-swallow: no undo offered beats a broken tab */
 return NextResponse.json({ ok: true, pages });
}

// POST { path } — restore that page to the version before its last save.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null); /* allow-swallow: answered with the 400 below */
 const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 300) : "";
 if (!path) return NextResponse.json({ error: "Missing page." }, { status: 400 });

 const ok = await undoCapturePageEdit(slug, path);
 if (!ok) return NextResponse.json({ error: "There’s nothing to undo on this page." }, { status: 409 });
 return NextResponse.json({ ok: true, path, pages: await listUndoablePages(slug).catch(() => []) });
}
