import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStoreBrief, saveStoreBrief, EMPTY_BRIEF, type StoreBrief } from "@/app/lib/store-brief-db";
import { getVoice } from "@/app/lib/store-voice";
import { layoutFromLabels } from "@/app/lib/description-layout";

export const dynamic = "force-dynamic";

// GET: this store's brief (what the owner told VYA about voice + pricing).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const brief = (await getStoreBrief(slug).catch(() => null)) ?? EMPTY_BRIEF;
 // The format VYA read off her existing listings, offered as a starting point. A shop that arrives
 // with a catalogue should open the layout editor and find its own format already in it, in its own
 // words, rather than a blank slate and a chore. Null when she has nothing to read yet.
 const voice = await getVoice(slug).catch(() => null);
 const learned = voice?.template?.templated
  ? { layout: layoutFromLabels(voice.template.labels), words: voice.template.medianWords }
  : null;
 return NextResponse.json({ brief, learned });
}

// POST { brief }: save this store's brief. Sanitized server-side in saveStoreBrief.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const brief = (body?.brief ?? body) as StoreBrief;
 if (!brief || typeof brief !== "object") return NextResponse.json({ error: "Bad brief" }, { status: 400 });
 await saveStoreBrief(slug, brief);
 return NextResponse.json({ ok: true });
}
