import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { generateStarterStorefront, isGenerateConfigured } from "@/app/lib/storefront-generate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST: VYA designs a complete starter storefront (template, colors, fonts,
// homepage sections, About/FAQ/Shipping pages) for the acting store.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isGenerateConfigured()) return NextResponse.json({ error: "VYA isn’t available yet." }, { status: 503 });
 const r = await generateStarterStorefront(slug);
 if (!r.ok) return NextResponse.json({ error: r.error || "Generation failed." }, { status: 502 });
 return NextResponse.json(r);
}
