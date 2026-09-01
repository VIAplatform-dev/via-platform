import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listCapturePaths } from "@/app/lib/site-capture-db";
import { getPageOrder, setPageOrder } from "@/app/lib/page-order-db";
import { sanitizePageOrder } from "@/app/lib/page-order";

export const dynamic = "force-dynamic";

// The seller's own arrangement of the pages strip in the editor.
//
// Housekeeping only: it changes which thumbnail sits where in HER editor and nothing whatsoever
// about her storefront. Nothing here is served to a shopper, which is why it is a plain preference
// and not part of the storefront design that has drafts and a publish step.

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json({ ok: true, order: (await getPageOrder(slug)) ?? [] });
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 if (!body || typeof body !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

 // Checked against the pages that actually exist, because the order arrives from a browser and is
 // not trusted to be a permutation of anything. sanitizePageOrder drops unknown paths and dupes.
 const paths = await listCapturePaths(slug);
 const order = sanitizePageOrder(body.order, paths);
 await setPageOrder(slug, order);
 return NextResponse.json({ ok: true, order });
}
