import { NextRequest, NextResponse } from "next/server";
import { webhookAuthorised } from "@/app/lib/webhook-hmac";
import { parseCarrierAdjustment, looksLikeAdjustment, adjustedTotalCents } from "@/app/lib/carrier-adjustment";
import { orderForLabelTransaction } from "@/app/lib/shippo-labels-db";
import { getOrderDetail, getOrderLabelCost, listParcelItemSizes } from "@/app/lib/db/orders";
import { getSellerById } from "@/app/lib/db/sellers";
import { recordShortfall } from "@/app/lib/shipping-shortfall-db";
import { sendOpsAlert } from "@/app/lib/email";
import { logError } from "@/app/lib/error-log";

export const dynamic = "force-dynamic";

// The carrier telling us it re-weighed a parcel and we owe it more.
//
// WHY THIS ROUTE EXISTS. A label is bought at the size the PIECE declares, so the carrier accepts
// it and says nothing at the counter. Days or weeks later it puts the parcel on its own scale,
// finds a coat where the label said 8oz, and bills the difference to whoever bought the label,
// which is VYA. Nothing here read those, so a store that under-declared every parcel cost money
// indefinitely and no number existed to show it.
//
// IT RECORDS, IT DOES NOT CHARGE. The row lands in the shortfall ledger marked recoverable, and a
// person decides what to do about it. A webhook that could move money on an undocumented payload
// shape is not something to build on a guess.
//
// SECURITY. This writes debts against named stores, so it is shut unless a secret is configured:
// no secret, no acceptance, rather than an open endpoint that quietly works. EasyPost signs the
// body (X-Hmac-Signature); Shippo does not sign at all, so its subscription URL carries ?token=.

export async function POST(request: NextRequest) {
 const secret = process.env.CARRIER_WEBHOOK_SECRET?.trim();
 // Shut, not open. An endpoint that writes a debt must never be the thing that was left unlocked.
 if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });

 const raw = await request.text();
 const ok = await webhookAuthorised({
  raw,
  signatureHeader: request.headers.get("x-hmac-signature"),
  token: new URL(request.url).searchParams.get("token"),
  secret,
 });
 if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = JSON.parse(raw || "{}") as unknown;
 const adj = parseCarrierAdjustment(body);

 if (!adj) {
  // Most of what a carrier sends is tracking, and ignoring it is correct. An event that CLAIMED to
  // be an adjustment and could not be read is different: EasyPost documents the event name but not
  // the ShipmentInvoice body, so the first unrecognised one has to be visible rather than dropped.
  if (looksLikeAdjustment(body)) {
   await sendOpsAlert(
    "Carrier adjustment we could not read",
    `A carrier posted an adjustment in a shape carrier-adjustment.ts doesn't parse, so no shortfall was recorded. Body:\n\n${raw.slice(0, 4000)}`,
   ).catch(() => {});
  }
  return NextResponse.json({ ok: true, ignored: true });
 }

 try {
  const orderId = await orderForLabelTransaction(adj.shipmentId);
  // A shipment we never bought, or one from before this table existed. Nothing to attribute it to,
  // and inventing an owner is worse than losing the row.
  if (!orderId) return NextResponse.json({ ok: true, unmatched: true });

  const order = await getOrderDetail(orderId);
  if (!order) return NextResponse.json({ ok: true, unmatched: true });

  const total = adjustedTotalCents(adj, await getOrderLabelCost(orderId));
  // A credit, or a restatement of what we already paid. Carriers issue those too, and neither is
  // something to bill a seller for.
  if (total === null) return NextResponse.json({ ok: true, noIncrease: true });

  const seller = await getSellerById(order.sellerId);
  const siblings = order.stripePaymentIntent
   ? await listParcelItemSizes(order.sellerId, order.stripePaymentIntent).catch(() => [])
   : [];

  const shortfall = await recordShortfall({
   orderId,
   storeSlug: seller?.slug || String(order.sellerId),
   paidCents: order.shippingPaidCents,
   labelCostCents: total,
   items: siblings.length ? siblings : [{ weightOz: order.itemWeightOz, lengthIn: order.itemLengthIn, widthIn: order.itemWidthIn, heightIn: order.itemHeightIn }],
   // The carrier weighed it and disagreed with what the piece said. That is the seller's, whether
   // or not she filled the measurements in.
   fromCarrierAdjustment: true,
  });

  await sendOpsAlert(
   `Carrier re-rated order ${orderId} (${seller?.slug ?? order.sellerId})`,
   `${adj.provider} says this parcel cost ${total}¢, against ${order.shippingPaidCents ?? 0}¢ collected.\n` +
   `Reason given: ${adj.reason ?? "none"}.\n${shortfall.note}\n\nRecorded as recoverable. Nothing has been charged.`,
  ).catch(() => {});

  return NextResponse.json({ ok: true, orderId, shortfallCents: shortfall.shortfallCents });
 } catch (err) {
  // 200, deliberately. A carrier that gets a 500 retries for days and then gives up, and the row it
  // was carrying is gone for good. Logged loudly instead, so the failure is ours to find.
  logError("carrier-adjustment-webhook", err, { severity: "critical", context: { shipmentId: adj.shipmentId } });
  return NextResponse.json({ ok: true, deferred: true });
 }
}
