import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { buildGrid, gridToCsv, type LedgerEntry } from "@/app/lib/analytics/pnl-grid";
import { parseLedgerCsv, summarise } from "@/app/lib/analytics/pnl-import-core";
import { saveImport, importedEntries, listImports, deleteImport } from "@/app/lib/analytics/pnl-import-db";

export const dynamic = "force-dynamic";

// The P&L as a grid — months across, lines down — over VYA's own records PLUS whatever the seller
// brought over from her spreadsheet. See app/lib/analytics/pnl-grid.ts for why it is a grid at all.

/** The lines, in the order a P&L reads. Fixed, so an empty month still shows every row. */
const ROW_ORDER = [
 { key: "revenue", label: "Revenue", direction: "in" as const },
 { key: "cogs", label: "Cost of goods", direction: "out" as const },
 { key: "fees", label: "VYA fees", direction: "out" as const },
 { key: "labels", label: "Shipping labels", direction: "out" as const },
 { key: "consignors", label: "Consignor payouts", direction: "out" as const },
 { key: "expenses", label: "Expenses", direction: "out" as const },
];

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

/** VYA's own records, by month. Mirrors the single-period query in analytics/margin.ts — same joins,
 *  same tax rule (revenue is the sale LESS the tax collected, which is never the seller's money). */
async function vyaEntries(sellerId: string, slug: string): Promise<LedgerEntry[]> {
 const out: LedgerEntry[] = [];
 const sales = (await db()`
  SELECT to_char(s.sold_at, 'YYYY-MM-01') AS on_month,
   COALESCE(SUM(s.amount_cents - COALESCE(s.tax_cents, 0)), 0)::bigint AS revenue_cents,
   COALESCE(SUM(i.cost_cents), 0)::bigint AS cost_cents,
   COALESCE(SUM(o.fee_cents), 0)::bigint AS fee_cents,
   COALESCE(SUM(o.label_cost_cents), 0)::bigint AS label_cost_cents,
   COALESCE(SUM(ROUND(s.amount_cents * ci.split_pct / 100.0)) FILTER (WHERE ci.split_pct IS NOT NULL), 0)::bigint AS consignor_cut_cents
  FROM vya_store_sales s
  JOIN items i ON i.id = s.item_id
  LEFT JOIN orders o ON s.origin = 'order' AND s.sale_id = 'order:' || o.id::text
  LEFT JOIN consignment_items ci ON ci.product_id = s.item_id::text
  WHERE s.seller_id = ${sellerId}::uuid
  GROUP BY 1 ORDER BY 1`) as Array<Record<string, unknown>>;

 for (const r of sales) {
  const date = String(r.on_month).slice(0, 10);
  const add = (rowKey: string, cents: unknown, direction: "in" | "out") => {
   const n = Number(cents) || 0;
   if (n !== 0) out.push({ date, rowKey, amountCents: Math.abs(n), direction });
  };
  add("revenue", r.revenue_cents, "in");
  add("cogs", r.cost_cents, "out");
  add("fees", r.fee_cents, "out");
  add("labels", r.label_cost_cents, "out");
  add("consignors", r.consignor_cut_cents, "out");
 }

 const spend = (await db()`
  SELECT to_char(occurred_on, 'YYYY-MM-01') AS on_month, COALESCE(SUM(amount_cents), 0)::bigint AS cents
  FROM store_expenses WHERE store_slug = ${slug} GROUP BY 1 ORDER BY 1`.catch(() => [])) as Array<Record<string, unknown>>;
 for (const r of spend) {
  const n = Number(r.cents) || 0;
  if (n !== 0) out.push({ date: String(r.on_month).slice(0, 10), rowKey: "expenses", amountCents: n, direction: "out" });
 }
 return out;
}

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug);
 if (!seller) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const [mine, imported, batches] = await Promise.all([
  vyaEntries(seller.id, slug).catch(() => [] as LedgerEntry[]),
  importedEntries(slug).catch(() => [] as LedgerEntry[]),
  listImports(slug).catch(() => []),
 ]);
 const grid = buildGrid([...mine, ...imported], ROW_ORDER);

 if (new URL(request.url).searchParams.get("format") === "csv") {
  return new NextResponse(gridToCsv(grid), {
   headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="profit-and-loss.csv"` },
  });
 }
 return NextResponse.json({ ok: true, grid, batches });
}

// POST { csv, fileName?, dayFirst?, commit? } — read a spreadsheet. Without `commit` nothing is
// written: she sees what we read, and what we couldn't, before any of it counts.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => ({})) as { csv?: unknown; fileName?: unknown; dayFirst?: unknown; commit?: unknown };
 const csv = typeof body.csv === "string" ? body.csv.slice(0, 5_000_000) : "";
 if (!csv.trim()) return NextResponse.json({ error: "That file was empty." }, { status: 400 });

 const parsed = parseLedgerCsv(csv, typeof body.dayFirst === "boolean" ? { dayFirst: body.dayFirst } : {});
 if (!parsed.rows.length) {
  return NextResponse.json({
   ok: false,
   error: parsed.mapping.date < 0
    ? "We couldn’t find a date column. Rename one of your columns to “Date” and try again."
    : "We couldn’t read an amount on any row.",
   headers: parsed.headers, skipped: parsed.skipped.slice(0, 20),
  }, { status: 422 });
 }

 // Money in is revenue; money out lands under Expenses, which is the honest place for a cost whose
 // category her sheet never named.
 const rows = parsed.rows.map((r) => ({ ...r, rowKey: r.direction === "in" ? "revenue" : "expenses" }));
 const summary = summarise(parsed.rows);

 if (body.commit !== true) {
  return NextResponse.json({
   ok: true, preview: true, summary, dayFirst: parsed.dayFirst, headers: parsed.headers,
   sample: rows.slice(0, 8), skipped: parsed.skipped.slice(0, 20), skippedTotal: parsed.skipped.length,
  });
 }

 const batchId = await saveImport(slug, typeof body.fileName === "string" ? body.fileName : null, rows);
 return NextResponse.json({ ok: true, committed: true, batchId, summary });
}

// DELETE { batchId } — take one upload back out, whole.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({})) as { batchId?: unknown };
 const id = typeof body.batchId === "string" ? body.batchId : "";
 if (!id) return NextResponse.json({ error: "Missing batch." }, { status: 400 });
 const removed = await deleteImport(slug, id).catch(() => 0);
 return NextResponse.json({ ok: true, removed });
}
