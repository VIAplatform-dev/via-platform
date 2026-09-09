import { NextRequest, NextResponse } from "next/server";
import { approveRequest, declineRequest, rentalContext, listRequests } from "@/app/lib/rentals/rentals-db";
import { seller, unauthorized, notFound, bad } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * The store's answer. Approving may quote a different price than the ladder —
 * trade rates for a stylist are the whole reason a store runs this mode.
 *
 * Approval can still fail: if the store wasn't holding the dates, someone may
 * have booked them while it deliberated. That's a real answer, not an error.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const { id } = await ctx.params;

 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const action = body.action === "decline" ? "decline" : body.action === "approve" ? "approve" : null;
 if (!action) return bad("action must be approve or decline.");

 if (action === "decline") {
  const ok = await declineRequest(id, acting.seller.id);
  return ok ? NextResponse.json({ ok: true, status: "declined" }) : notFound();
 }

 const mine = (await listRequests(acting.seller.id)).find((r) => r.id === id);
 if (!mine) return notFound();

 const { settings } = await rentalContext(mine.itemId, acting.slug);
 const quoted = body.quotedCents == null ? null : Math.round(Number(body.quotedCents));
 if (quoted != null && (!Number.isFinite(quoted) || quoted < 0)) return bad("quotedCents must be a positive amount.");

 const out = await approveRequest(id, acting.seller.id, { quotedCents: quoted, settings });
 if (!out) return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 200 });
 return NextResponse.json({ ok: true, status: "approved", request: out.request, booking: out.booking });
}
