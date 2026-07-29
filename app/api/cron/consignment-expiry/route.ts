import { NextResponse } from "next/server";
import { expireOverdueConsignments } from "@/app/lib/consignment-db";
import { sendConsignmentExpiryDigest } from "@/app/lib/email";
import { logError } from "@/app/lib/error-log";

// Expiry sweep: once a day, flip every consigned item past its agreed end date to 'expired'
// (surfaces as "Ended" in the consignor portal) and email each affected store a digest so the
// owner can return the piece or renew the terms. Does not pull anything from sale — that's the
// store's call. Idempotent (an item is only ever swept once), so a re-run is harmless.
export const maxDuration = 300;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const expired = await expireOverdueConsignments();
 if (!expired.length) return NextResponse.json({ ok: true, expired: 0, storesNotified: 0 });

 // Group the swept pieces by store, then send one digest per store.
 const byStore = new Map<string, { consignor: string; title: string; expiresAt: string }[]>();
 for (const it of expired) {
 const list = byStore.get(it.storeSlug) || [];
 list.push({ consignor: it.consignor, title: it.title, expiresAt: it.expiresAt });
 byStore.set(it.storeSlug, list);
 }

 let storesNotified = 0;
 for (const [slug, items] of byStore) {
 try {
 await sendConsignmentExpiryDigest(slug, items);
 storesNotified++;
 } catch (e) {
 await logError("consignment-expiry-digest", e, { context: { storeSlug: slug, count: items.length } });
 }
 }

 return NextResponse.json({ ok: true, expired: expired.length, storesNotified });
}
