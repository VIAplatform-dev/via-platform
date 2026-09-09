import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { campaignRenderer, parseCampaignDesign } from "@/app/lib/campaign-email";

export const dynamic = "force-dynamic";

// POST — render the email a seller is editing, exactly as it will send.
//
// Thin on purpose: campaign-email.ts builds it, and the test send, the real send and the scheduled
// send all call the same thing. An editor whose preview is drawn by different code is an editor that
// lies, and the lie only shows up in someone's inbox — which is exactly what happened before.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const design = parseCampaignDesign(await request.json().catch(() => ({})));
 const { render, storeName } = await campaignRenderer(slug, design);
 // A real unsubscribe link is signed per recipient; the preview has no recipient, so it shows the
 // link in place without one behind it.
 return NextResponse.json({ ok: true, html: render("https://example.com/unsubscribe"), storeName });
}
