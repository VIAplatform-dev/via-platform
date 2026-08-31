import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { actingSeller } from "@/app/lib/market/auth";
import { draftListing, isIntakeConfigured, type ListingDraft } from "@/app/lib/ai-intake";
import { gate } from "@/app/lib/concurrency";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AI_GATE = () => gate("intake-ai", Number(process.env.INTAKE_AI_CONCURRENCY) || 3);

// Market quick list, step 1: photo → AI draft. ONE call, no pricing/comps/PhotoRoom — the seller sets
// the price. The photo (already a browser-resized JPEG) is stored so the listing has an image.
const QUICK_HINT = "\n\nMARKET QUICK LIST: the seller is at a busy market. Keep the title under 60 characters and the description to two plain sentences. Never guess a brand from style alone.";

export async function POST(request: NextRequest) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const image = typeof body?.image === "string" ? body.image : "";
 const m = /^data:(image\/jpeg|image\/png|image\/webp);base64,(.+)$/i.exec(image);
 if (!m || image.length > 4_000_000) return NextResponse.json({ error: "Send a JPEG data URL under ~3 MB." }, { status: 400 });

 const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
 const blob = await put(`market/${acting.slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, Buffer.from(m[2], "base64"), { access: "public", contentType: m[1] });

 // Manual quick list: store the photo only — the seller types name + price themselves.
 if (body?.ai === false) return NextResponse.json({ imageUrl: blob.url, draft: null });
 if (!isIntakeConfigured()) return NextResponse.json({ imageUrl: blob.url, draft: null, notConfigured: true });
 let draft: ListingDraft | null = null;
 try { draft = await AI_GATE().run(() => draftListing([blob.url], undefined, QUICK_HINT)); }
 catch (e) { console.error("[market/quick-list] draft failed:", e); }
 return NextResponse.json({
 imageUrl: blob.url,
 draft: draft ? {
 title: draft.title, description: draft.description,
 brand: draft.brand.value, brandConfidence: draft.brand.confidence,
 era: draft.era.value, material: draft.material.value, condition: draft.condition.value,
 category: draft.category, size: null as string | null, priceHint: draft.priceHint,
 } : null,
 });
}
