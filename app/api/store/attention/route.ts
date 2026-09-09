import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { attentionForStore } from "@/app/lib/attention-db";

export const dynamic = "force-dynamic";

// GET — what needs the seller today: counts, the rows Home shows (only the non-zero ones, in the
// order attention-core.ts fixes), and the ids of live pieces whose AI price wants a look (so
// Inventory's ?missing=confidence filter can pick them out). Web session or the phone's JWT.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json(await attentionForStore(slug));
}
