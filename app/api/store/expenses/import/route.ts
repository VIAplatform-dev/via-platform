import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { addExpense } from "@/app/lib/expenses-db";
import { parseExpenseFile, looksBinary, type ImportField } from "@/app/lib/expense-import";

export const dynamic = "force-dynamic";

// Import a seller's own costs spreadsheet.
//
// TWO STEPS, ALWAYS. A preview reads the file and shows what it found; a commit writes it. Nothing
// is written on the first call, because the parser is guessing at somebody's columns and the cost
// of guessing wrong is wrong money in their books. The seller sees the rows, fixes the column
// mapping if we got it wrong, and only then confirms.
//
// The reading itself is in expense-import.ts and is pure — this route is auth, limits, and writes.

/** Bigger than any real costs sheet, small enough that a bad upload can't tie up the process. */
const MAX_CHARS = 2_000_000;
const MAX_ROWS = 5_000;
/** How many parsed rows the preview sends back. The counts and totals always cover everything. */
const PREVIEW_ROWS = 50;

function readMapping(raw: unknown): Partial<Record<ImportField, number>> | undefined {
 if (!raw || typeof raw !== "object") return undefined;
 const out: Partial<Record<ImportField, number>> = {};
 for (const f of ["date", "label", "amount", "category"] as ImportField[]) {
  const v = (raw as Record<string, unknown>)[f];
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 512) out[f] = v;
 }
 return Object.keys(out).length ? out : undefined;
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const text = typeof body?.text === "string" ? body.text : "";
 if (!text.trim()) return NextResponse.json({ error: "That file looks empty." }, { status: 400 });
 if (text.length > MAX_CHARS) {
  return NextResponse.json({ error: "That file is too big to read here — split it, or trim it to the year you need." }, { status: 413 });
 }
 // A real .xlsx is a zip, so what arrives is binary noise. Say what to do rather than "0 rows found".
 if (looksBinary(text)) {
  return NextResponse.json({
   error: "That looks like an Excel workbook rather than a CSV. In Excel choose File → Save As → CSV, then upload that.",
   needsCsv: true,
  }, { status: 415 });
 }

 const parsed = parseExpenseFile(text, readMapping(body?.mapping));
 if (!parsed.expenses.length && !parsed.problems.length) {
  return NextResponse.json({ error: "Couldn’t find any rows in that file. It needs a header row with a date, a description and an amount." }, { status: 400 });
 }
 if (parsed.expenses.length > MAX_ROWS) {
  return NextResponse.json({ error: `That file has ${parsed.expenses.length.toLocaleString()} rows — more than can be imported at once. Split it by year.` }, { status: 413 });
 }

 const totalCents = parsed.expenses.reduce((n, e) => n + e.amountCents, 0);
 const summary = {
  headers: parsed.headers,
  mapping: parsed.mapping,
  counts: { ready: parsed.expenses.length, problems: parsed.problems.length, skipped: parsed.skipped },
  totalCents,
  preview: parsed.expenses.slice(0, PREVIEW_ROWS),
  problems: parsed.problems.slice(0, PREVIEW_ROWS),
 };

 // ── Preview ────────────────────────────────────────────────────────────────
 if (body?.commit !== true) return NextResponse.json({ ok: true, committed: false, ...summary });

 // ── Commit ─────────────────────────────────────────────────────────────────
 // Row by row rather than one statement: a single bad row must not take the other 400 with it, and
 // the seller is told exactly how many landed. `source: "import"` marks them so a bad import can be
 // picked out later from what she typed herself.
 const tz = typeof body?.tz === "string" ? body.tz : null;
 let imported = 0;
 const failed: { row: number; reason: string }[] = [];
 for (const e of parsed.expenses) {
  try {
   await addExpense(slug, {
    amountCents: e.amountCents,
    label: e.label,
    category: e.category,
    occurredOn: e.occurredOn,
    source: "import",
    tz,
   });
   imported++;
  } catch (err) {
   failed.push({ row: e.row, reason: err instanceof Error ? err.message : "Couldn’t save that row." });
  }
 }

 return NextResponse.json({
  ok: true,
  committed: true,
  imported,
  failed: failed.slice(0, PREVIEW_ROWS),
  failedCount: failed.length,
  ...summary,
 });
}
