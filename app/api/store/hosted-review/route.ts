import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { addStoreReview, getStoreHealth, listStoreReviews, type ReviewAnswer } from "@/app/lib/store-health-db";

export const dynamic = "force-dynamic";

// GET — the store's latest check (tiered findings + side-by-side screenshots) and the seller's
// own answers so far. Findings are already worded for a seller (app/lib/store-health.ts).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [health, reviews] = await Promise.all([getStoreHealth(slug), listStoreReviews(slug)]);
 return NextResponse.json({ ok: true, health, reviews });
}

const ANSWERS = new Set<ReviewAnswer>(["looks_right", "something_off", "skip"]);

// POST { page, answer, note? } — the seller's verdict on one side-by-side. This is the 1:1 check
// no pixel diff can do: the person who knows what their store should look like says so.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 const page = typeof b?.page === "string" && b.page.startsWith("/") ? b.page.slice(0, 300) : null;
 const answer = ANSWERS.has(b?.answer) ? (b.answer as ReviewAnswer) : null;
 if (!page || !answer) return NextResponse.json({ error: "page and answer are required" }, { status: 400 });
 const note = typeof b?.note === "string" && b.note.trim() ? b.note.trim().slice(0, 2000) : null;
 if (answer === "something_off" && !note) return NextResponse.json({ error: "Tell us what looks off" }, { status: 400 });
 await addStoreReview(slug, page, answer, note);
 return NextResponse.json({ ok: true, reviews: await listStoreReviews(slug) });
}
