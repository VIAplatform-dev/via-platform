import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listCampaigns, cancelScheduledCampaign } from "@/app/lib/store-campaigns-db";
import { getAutomations } from "@/app/lib/automations-db";
import type { Campaign } from "@/app/lib/store-campaigns-db";

export const dynamic = "force-dynamic";

// Every email a store sends, in one list: the automatic ones, what's scheduled, what's a draft, and
// what has already gone. Previously these lived in three places and a seller had no way to see, in
// one look, what her shop was about to send.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const [campaigns, automations] = await Promise.all([
  listCampaigns(slug, 60).catch(() => []),
  getAutomations(slug).catch(() => []),
 ]);

 return NextResponse.json({
  ok: true,
  automatic: automations,
  drafts: campaigns.filter((c: Campaign) => c.status === "draft"),
  scheduled: campaigns.filter((c: Campaign) => c.status === "scheduled"),
  sent: campaigns.filter((c: Campaign) => c.status === "sent").slice(0, 20),
 });
}

/** DELETE ?id= — call off something scheduled. A draft is deleted the same way. */
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const id = Number(new URL(request.url).searchParams.get("id"));
 if (!Number.isFinite(id)) return NextResponse.json({ error: "Which one?" }, { status: 400 });
 await cancelScheduledCampaign(slug, id);
 return NextResponse.json({ ok: true });
}
