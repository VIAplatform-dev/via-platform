import { NextRequest, NextResponse } from "next/server";
import { generateStorePreview } from "@/app/lib/generate-store-preview";

export const dynamic = "force-dynamic";

// Public (landing-page trial): POST { description } → a store-identity preview populated with
// real VYA products matched to the vibe. Read-only; persists nothing.
export async function POST(request: NextRequest) {
 const b = await request.json().catch(() => ({}));
 const description = String(b?.description || "").trim();
 if (description.length < 3) return NextResponse.json({ error: "Describe your shop in a sentence." }, { status: 400 });
 try {
 const preview = await generateStorePreview(description);
 return NextResponse.json({ ok: true, ...preview });
 } catch {
 return NextResponse.json({ error: "Couldn’t design that just now. Try again." }, { status: 502 });
 }
}
