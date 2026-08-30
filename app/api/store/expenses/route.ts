import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import {
 addExpense, listExpenses, expenseTotals, deleteExpense, listRecurring,
 isExpenseCategory, EXPENSE_CATEGORIES,
} from "@/app/lib/expenses-db";
import { resolvePeriod } from "@/app/lib/analytics/period";

export const dynamic = "force-dynamic";

// The acting store's operating costs — the half of a P&L that isn't inventory.
// Reads and writes share the analytics period vocabulary (?period=2026-Q3&tz=…)
// so what you see here is exactly what the Profit tab is adding up.

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const q = new URL(request.url).searchParams;
 const period = resolvePeriod({ period: q.get("period"), from: q.get("from"), to: q.get("to"), tz: q.get("tz") });
 const { startISO, endISO } = period.current;

 try {
  const [totals, expenses, recurring] = await Promise.all([
   expenseTotals(slug, startISO, endISO, period.tz),
   listExpenses(slug, startISO, endISO, 200, period.tz),
   listRecurring(slug),
  ]);
  return NextResponse.json({
   ok: true,
   period: { key: period.key, label: period.current.label, startISO, endISO },
   categories: EXPENSE_CATEGORIES,
   ...totals,
   expenses,
   // Rates are returned whole, not clipped to the window — they're settings, not events.
   recurring,
  });
 } catch (e) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}

// POST { amountUsd, label, category, occurredOn?, recurs? } — add one cost by hand,
// or a rate: recurs "monthly" (a fixed bill) or "per_order" (a packing-recipe line).
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const dollars = Number(body?.amountUsd);
 if (!Number.isFinite(dollars) || dollars <= 0) {
  return NextResponse.json({ error: "Enter an amount above zero." }, { status: 400 });
 }
 if (!isExpenseCategory(body?.category)) {
  return NextResponse.json({ error: "Pick a category." }, { status: 400 });
 }

 const recurs = body?.recurs === "monthly" || body?.recurs === "per_order" ? body.recurs : null;

 try {
  const saved = await addExpense(slug, {
   amountCents: Math.round(dollars * 100),
   label: String(body?.label ?? ""),
   category: body.category,
   occurredOn: typeof body?.occurredOn === "string" ? body.occurredOn : null,
   source: "typed",
   recurs,
   tz: typeof body?.tz === "string" ? body.tz : null,
  });
  return NextResponse.json({ ok: true, expense: saved });
 } catch (e) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save that cost." }, { status: 400 });
 }
}

// DELETE ?id= — remove a cost the seller entered by mistake.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const id = new URL(request.url).searchParams.get("id");
 if (!id) return NextResponse.json({ error: "Which cost?" }, { status: 400 });
 const removed = await deleteExpense(slug, id).catch(() => false);
 if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
 return NextResponse.json({ ok: true });
}
