import { NextRequest, NextResponse } from "next/server";
import { getAppointment, listVisitItems } from "@/app/lib/appointments/appointments-db";
import { sendVisitFollowUp } from "@/app/lib/appointments/notify";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";
import { storePublicOrigin } from "@/app/lib/plan-b/store-host";
import { seller, unauthorized, notFound, bad } from "../../_shared";

export const dynamic = "force-dynamic";

// The note after someone's been in, with the pieces they handled already in it.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const { id } = await ctx.params;

 const appointment = await getAppointment(id);
 if (!appointment || appointment.sellerId !== acting.seller.id) return notFound();
 if (!appointment.customerEmail) return bad("This booking has no email to write to.");

 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
 if (!message.trim()) return bad("Write something to send.");

 // Only the pieces the seller ticked — a follow-up listing things they didn't look at reads worse
 // than one that lists nothing.
 const only = Array.isArray(body.itemIds) ? new Set(body.itemIds.map(String)) : null;
 const items = (await listVisitItems(id)).filter((i) => !only || only.has(i.itemId));

 const sf = await getStorefrontBySlug(acting.slug).catch(() => null);
 const link = sf?.customDomain
  ? `https://${sf.customDomain}/shop`
  : (storePublicOrigin(acting.slug) ? `${storePublicOrigin(acting.slug)}/shop` : undefined);

 const ok = await sendVisitFollowUp(acting.slug, appointment, { message, items, link });
 return ok
  ? NextResponse.json({ ok: true, sent: appointment.customerEmail, items: items.length })
  : NextResponse.json({ error: "Couldn't send that just now." }, { status: 502 });
}
