import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { parseConsignors } from "@/app/lib/parse-consignment";
import { importConsignors } from "@/app/lib/consignment-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { csv, source? } — migrate a store's consignor roster + outstanding balances from another
// consignment platform (ConsignCloud/SimpleConsign/Ricochet/spreadsheet). Column-mapped generically.
// Balances land as one-time `opening_balance` ledger entries — the stated figure, never a replay of
// past sales — so nothing is double-counted or double-paid. Idempotent by consignor.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const csv = typeof body?.csv === "string" ? body.csv : "";
 const source = typeof body?.source === "string" ? body.source.slice(0, 40) : "csv";
 if (!csv.trim()) return NextResponse.json({ error: "Paste or upload your consignor export first." }, { status: 400 });

 const rows = parseConsignors(csv);
 if (!rows.length) {
 return NextResponse.json({ error: "Couldn’t read any consignors — make sure your file has a header row with at least a name column." }, { status: 400 });
 }

 const { added, updated, balancesSet, openingBalanceCents } = await importConsignors(slug, rows, source);
 return NextResponse.json({ ok: true, found: rows.length, added, updated, balancesSet, openingBalanceCents });
}
