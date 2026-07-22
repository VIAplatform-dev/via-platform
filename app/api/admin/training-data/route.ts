import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { getTrainingStats, backfillFromItems, backfillFromProducts, backfillFromSold } from "@/app/lib/training-data-db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET — training dataset stats (admin only).
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 return NextResponse.json({ ok: true, ...(await getTrainingStats()) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

// POST — backfill every existing listing (VYA inventory + marketplace products) into
// the training dataset. Idempotent: re-running only adds what's new.
export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const [items, products, sold] = await Promise.all([backfillFromItems(), backfillFromProducts(), backfillFromSold()]);
 return NextResponse.json({ ok: true, added: { items, products, sold }, ...(await getTrainingStats()) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
