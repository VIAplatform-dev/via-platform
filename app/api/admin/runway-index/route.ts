import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { ingestRunwayLooks, runwayIndexStats, deleteRunwayLooksByLicense, type IngestLook } from "@/app/lib/runway-index";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Owner-only. Loads a LICENSED runway corpus into the look index — vectors and
// metadata only, never the photographs, so the images stay wherever they're
// licensed to live and `licenseRef` lets a whole corpus be pulled if that changes.
//
//   GET                       → what's in the index
//   POST { looks: [...] }     → embed and add a batch
//   DELETE ?licenseRef=…      → remove everything held under one licence

const MAX_BATCH = 200; // one Voyage batch run; a loader pages through

export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 try {
  return NextResponse.json({ ok: true, ...(await runwayIndexStats()) });
 } catch (e) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

 const body = await request.json().catch(() => ({}));
 const raw = Array.isArray(body?.looks) ? body.looks : [];
 if (!raw.length) return NextResponse.json({ error: "Send { looks: [...] }." }, { status: 400 });
 if (raw.length > MAX_BATCH) return NextResponse.json({ error: `Send at most ${MAX_BATCH} looks per call.` }, { status: 400 });

 const looks: IngestLook[] = [];
 for (const l of raw) {
  const year = Number(l?.year);
  if (!l?.imageUrl || !l?.house || !l?.season || !Number.isInteger(year)) continue;
  looks.push({
   imageUrl: String(l.imageUrl),
   house: String(l.house).slice(0, 120),
   season: String(l.season).slice(0, 20),
   year,
   lookNo: Number.isFinite(Number(l.lookNo)) ? Number(l.lookNo) : null,
   sourceUrl: l.sourceUrl ? String(l.sourceUrl) : String(l.imageUrl),
   licenseRef: l.licenseRef ? String(l.licenseRef).slice(0, 120) : null,
  });
 }
 if (!looks.length) return NextResponse.json({ error: "No look had imageUrl, house, season and year." }, { status: 400 });

 try {
  const result = await ingestRunwayLooks(looks);
  return NextResponse.json({ ok: true, received: raw.length, ...result, ...(await runwayIndexStats()) });
 } catch (e) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Ingest failed" }, { status: 500 });
 }
}

export async function DELETE(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 const licenseRef = new URL(request.url).searchParams.get("licenseRef");
 if (!licenseRef) return NextResponse.json({ error: "Pass ?licenseRef= to choose what to remove." }, { status: 400 });
 const removed = await deleteRunwayLooksByLicense(licenseRef).catch(() => 0);
 return NextResponse.json({ ok: true, removed });
}
