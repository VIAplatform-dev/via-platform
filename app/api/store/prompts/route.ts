import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { answeredPrompts, answerPrompt } from "@/app/lib/store-prompts-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getDb, items } from "@/app/lib/db/index";
import { and, eq } from "drizzle-orm";
import { storeHasCapture } from "@/app/lib/domain-routing-edge";

export const dynamic = "force-dynamic";

// GET: everything a first-run card needs to decide whether to appear, in one request: what has
// been answered, whether she brought a website over, and whether anything has come from Depop yet.
// Three calls for one small card is three chances to flicker.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const seller = await getSellerBySlug(slug).catch(() => null);
 const db = getDb();
 const [answered, hasCapturedSite, depopRows] = await Promise.all([
  answeredPrompts(slug),
  storeHasCapture(slug).catch(() => false),
  seller
   ? db.select({ id: items.id }).from(items)
      .where(and(eq(items.sellerId, seller.id), eq(items.sourcePlatform, "depop")))
      .limit(1).catch(() => [] as { id: string }[])
   : Promise.resolve([] as { id: string }[]),
 ]);

 return NextResponse.json({
  ok: true,
  answered,
  hasCapturedSite,
  depopImported: depopRows.length > 0,
 });
}

// POST { key }: she answered one. See store-prompts-db for why this is not localStorage.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const key = typeof body?.key === "string" ? body.key : "";
 if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
 await answerPrompt(slug, key);
 return NextResponse.json({ ok: true, answered: await answeredPrompts(slug) });
}
