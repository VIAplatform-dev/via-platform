import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { refreshGridKit } from "@/app/lib/site-builder/grid-kit-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { refresh: true } — "Refresh card look": derive the store's grid kit again from her captured
// collection pages and store it (a reserved capture row, see grid-kit-store.ts). A seller action,
// scoped to her own store; every grid she has added takes the new card on its next render.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null); /* allow-swallow: answered with the 400 below */
 if (body?.refresh !== true) return NextResponse.json({ error: "Send { refresh: true }." }, { status: 400 });
 try {
  const kit = await refreshGridKit(slug);
  return NextResponse.json({ ok: true, kit: kit ? "theme" : "simple", sourcePath: kit?.sourcePath ?? null });
 } catch {
  return NextResponse.json({ error: "Couldn’t read your card look just now. Try again in a moment." }, { status: 500 });
 }
}
