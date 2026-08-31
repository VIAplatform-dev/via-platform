import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getRefundPolicy, setRefundPolicy } from "@/app/lib/store-policy-db";
import { payoutScheduleNotice, syncPayoutSchedule } from "@/app/lib/payout-schedule";

export const dynamic = "force-dynamic";

// GET — the acting store's return/refund policy.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json({ ok: true, policy: await getRefundPolicy(slug) });
}

// POST { refundsEnabled?, returnWindowDays?, policyText? } — update it.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 const policy = await setRefundPolicy(slug, {
  refundsEnabled: typeof b?.refundsEnabled === "boolean" ? b.refundsEnabled : undefined,
  returnWindowDays: typeof b?.returnWindowDays === "number" ? b.returnWindowDays : undefined,
  restockingFeePct: typeof b?.restockingFeePct === "number" ? b.restockingFeePct : undefined,
  returnShippingPaidBy: b?.returnShippingPaidBy === "buyer" || b?.returnShippingPaidBy === "store" ? b.returnShippingPaidBy : undefined,
  policyText: b?.policyText !== undefined ? b.policyText : undefined,
 });
 // The payout hold follows the window they just set: lengthen the policy and the money waits
 // longer; go final-sale and they're paid as fast as Stripe allows. Best-effort — a Stripe hiccup
 // must not lose the seller their policy edit (see syncPayoutSchedule).
 const schedule = await syncPayoutSchedule(slug).catch(() => null);
 return NextResponse.json({
  ok: true,
  policy,
  payoutDelayDays: schedule?.delayDays ?? null,
  // Said out loud when their window is longer than Stripe will hold the money for.
  payoutNotice: schedule ? payoutScheduleNotice(schedule) : null,
 });
}
