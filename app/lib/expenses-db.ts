import { neon } from "@neondatabase/serverless";

// ───────────────────────────────────────────────────────────────────────────
// Store operating costs — the other half of a P&L.
//
// `items.cost_cents` covers what a piece cost to buy, which gets you gross
// profit. Everything else a store spends to trade — mailers, dust bags, flyers,
// the studio, ads, market stalls — lives here, and it's what turns the Profit
// tab from a margin into a real profit & loss statement.
//
// One row per cost, whatever door it came in through: typed into the statement,
// or said out loud to the assistant ("spent 84 on poly mailers"). `source`
// records which, so the seller can always tell what they entered by hand from
// what something else worked out for them.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

/**
 * The categories a cost can land in. Deliberately short and in a reseller's own
 * words — this is a list someone picks from on their phone, not a chart of
 * accounts. One definition, shared by the statement, the API and the assistant,
 * so none of them can drift.
 */
export const EXPENSE_CATEGORIES = [
 { key: "packaging", label: "Packaging & packing" },
 { key: "shipping", label: "Shipping supplies" },
 { key: "marketing", label: "Marketing & ads" },
 { key: "studio", label: "Studio & fixed" },
 { key: "fees", label: "Market & selling fees" },
 { key: "repairs", label: "Repairs & cleaning" },
 { key: "sourcing", label: "Sourcing costs" },
 { key: "other", label: "Other" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];
const CATEGORY_KEYS = new Set(EXPENSE_CATEGORIES.map((c) => c.key));

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
 return typeof v === "string" && CATEGORY_KEYS.has(v as ExpenseCategory);
}

export function categoryLabel(key: string): string {
 return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? "Other";
}

// Where a cost came from — shown in the list so a seller can tell what she typed from what a
// spreadsheet import brought in, and undo a bad import without touching her own entries.
export type ExpenseSource = "typed" | "assistant" | "import";

/**
 * How a cost repeats.
 *
 *  null        — a one-off, on the day it happened.
 *  "monthly"   — a fixed monthly bill (studio rent, insurance). `amountCents` is
 *                the MONTHLY rate, charged pro-rata across whatever window is shown.
 *  "per_order" — a packing-recipe line (a mailer, a dust bag). `amountCents` is the
 *                cost of ONE, multiplied by the sales in the window.
 *
 * Recurring rows are rates, not events, so `occurred_on` reads as "effective from":
 * adding studio rent today must not retroactively invent rent for last year.
 */
export type ExpenseRecurrence = "monthly" | "per_order";

export type Expense = {
 id: string;
 /** The day it happened, or for a recurring rate, the day it started applying. */
 occurredOn: string;
 category: ExpenseCategory;
 label: string;
 amountCents: number;
 source: ExpenseSource;
 recurs: ExpenseRecurrence | null;
 createdAt: string | null;
};

let ensured = false;
async function ensure() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_slug TEXT NOT NULL,
  occurred_on DATE NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'typed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_expenses_store_date ON store_expenses (store_slug, occurred_on DESC)`;
 // Added after the table shipped: a rate rather than a one-off event. See ExpenseRecurrence.
 await sql`ALTER TABLE store_expenses ADD COLUMN IF NOT EXISTS recurs TEXT`;
 ensured = true;
}

function mapRow(r: Record<string, unknown>): Expense {
 return {
  id: String(r.id),
  // DATE comes back as a Date in some drivers; slice to the calendar day either way.
  occurredOn: new Date(r.occurred_on as string).toISOString().slice(0, 10),
  category: (isExpenseCategory(r.category) ? r.category : "other") as ExpenseCategory,
  label: String(r.label),
  amountCents: Number(r.amount_cents) || 0,
  source: (r.source === "assistant" || r.source === "import" ? r.source : "typed") as ExpenseSource,
  recurs: r.recurs === "monthly" || r.recurs === "per_order" ? r.recurs : null,
  createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : null,
 };
}

/**
 * A [start, end) instant window as the pair of CALENDAR DAYS an expense query
 * needs — end inclusive.
 *
 * Naively slicing the exclusive end instant to 10 characters drops the current
 * day: a rolling 30-day window ends at this moment on, say, the 30th, so
 * `occurred_on < '2026-08-30'` silently excludes everything logged today —
 * which is most of what a seller has just entered. Taking the day that
 * *contains* the last instant of the window fixes it for both rolling windows
 * and calendar ones (a quarter ending 1 Oct 00:00 resolves to 30 Sep).
 */
export function windowDates(startISO: string, endISO: string, tz?: string | null): [string, string] {
 const day = (d: Date) => {
  try {
   return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
   return d.toISOString().slice(0, 10);
  }
 };
 const start = day(new Date(startISO));
 const endInclusive = day(new Date(Date.parse(endISO) - 1));
 return [start, endInclusive < start ? start : endInclusive];
}

/** Today in the store's timezone — a cost said "today" must not land on yesterday. */
export function todayIn(tz: string | null | undefined): string {
 try {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
 } catch {
  return new Date().toISOString().slice(0, 10);
 }
}

export async function addExpense(storeSlug: string, e: {
 amountCents: number;
 label: string;
 category: ExpenseCategory;
 occurredOn?: string | null;
 source?: ExpenseSource;
 recurs?: ExpenseRecurrence | null;
 tz?: string | null;
}): Promise<Expense> {
 await ensure();
 const amount = Math.round(e.amountCents);
 if (!Number.isFinite(amount) || amount <= 0) throw new Error("An amount above zero is required.");
 const label = e.label.trim().slice(0, 160) || categoryLabel(e.category);
 const on = e.occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(e.occurredOn) ? e.occurredOn : todayIn(e.tz);
 const rows = (await db()`
  INSERT INTO store_expenses (store_slug, occurred_on, category, label, amount_cents, source, recurs)
  VALUES (${storeSlug}, ${on}, ${e.category}, ${label}, ${amount}, ${e.source ?? "typed"}, ${e.recurs ?? null})
  RETURNING *
 `) as Array<Record<string, unknown>>;
 return mapRow(rows[0]);
}

/** Costs inside a window, newest first. The window is the analytics period's [start, end). */
export async function listExpenses(storeSlug: string, startISO: string, endISO: string, limit = 200, tz?: string | null): Promise<Expense[]> {
 await ensure();
 const [from, to] = windowDates(startISO, endISO, tz);
 const rows = (await db()`
  SELECT * FROM store_expenses
  WHERE store_slug = ${storeSlug} AND recurs IS NULL
   AND occurred_on >= ${from} AND occurred_on <= ${to}
  ORDER BY occurred_on DESC, created_at DESC LIMIT ${limit}
 `) as Array<Record<string, unknown>>;
 return rows.map(mapRow);
}

export type CategoryTotal = { category: ExpenseCategory; label: string; amountCents: number; count: number };

/** Totals per category for a window — the operating-costs block of the statement. */
export async function expenseTotals(storeSlug: string, startISO: string, endISO: string, tz?: string | null): Promise<{ totalCents: number; byCategory: CategoryTotal[] }> {
 await ensure();
 const [from, to] = windowDates(startISO, endISO, tz);
 const rows = (await db()`
  SELECT category, SUM(amount_cents)::bigint AS cents, COUNT(*)::int AS n
  FROM store_expenses
  WHERE store_slug = ${storeSlug} AND recurs IS NULL
   AND occurred_on >= ${from} AND occurred_on <= ${to}
  GROUP BY 1
 `) as Array<Record<string, unknown>>;
 const found = new Map(rows.map((r) => [String(r.category), { cents: Number(r.cents) || 0, n: Number(r.n) || 0 }]));
 // Every category is returned, including empty ones — an empty line is what the
 // statement turns into an "add" affordance, so it has to be there to be clicked.
 const byCategory: CategoryTotal[] = EXPENSE_CATEGORIES.map((c) => ({
  category: c.key,
  label: c.label,
  amountCents: found.get(c.key)?.cents ?? 0,
  count: found.get(c.key)?.n ?? 0,
 }));
 return { totalCents: byCategory.reduce((a, b) => a + b.amountCents, 0), byCategory };
}

export async function deleteExpense(storeSlug: string, id: string): Promise<boolean> {
 await ensure();
 const rows = (await db()`DELETE FROM store_expenses WHERE store_slug = ${storeSlug} AND id = ${id}::uuid RETURNING id`) as unknown[];
 return rows.length > 0;
}

// ── Recurring rates ────────────────────────────────────────────────────────
// A recipe line and a monthly bill are RATES, not events. They turn into money
// only against a window: a per-order line needs the sales in it, a monthly line
// needs how much of a month it spans. Both are prorated from the day the seller
// says the cost started, so adding studio rent today never invents rent for a
// quarter that has already closed.

/** The mean Gregorian month, so a 90-day quarter reads as ~2.96 months, not 3.0. */
const DAYS_PER_MONTH = 365.25 / 12;

export type RecurringRate = Expense & { recurs: ExpenseRecurrence };

/** Every rate the store has on record, newest first. */
export async function listRecurring(storeSlug: string): Promise<RecurringRate[]> {
 await ensure();
 const rows = (await db()`
  SELECT * FROM store_expenses
  WHERE store_slug = ${storeSlug} AND recurs IS NOT NULL
  ORDER BY recurs, created_at
 `) as Array<Record<string, unknown>>;
 return rows.map(mapRow).filter((e): e is RecurringRate => e.recurs !== null);
}

export type AppliedRecurring = {
 /** Category totals contributed by rates, ready to merge into the one-off totals. */
 byCategory: Map<ExpenseCategory, number>;
 totalCents: number;
 perOrder: { rateCents: number; sales: number; appliedCents: number };
 monthly: { rateCents: number; months: number; appliedCents: number };
};

/**
 * Turn the rates into real money for one window.
 *
 * `salesOn` is the store's sale count keyed by day (YYYY-MM-DD) — passed in
 * rather than queried here so this module stays free of the sales read model,
 * and so the count matches whatever basis the statement's revenue used.
 */
export async function applyRecurring(
 storeSlug: string,
 startISO: string,
 endISO: string,
 salesOn: Map<string, number>,
 tz?: string | null,
): Promise<AppliedRecurring> {
 const rates = await listRecurring(storeSlug).catch(() => [] as RecurringRate[]);
 const [from, to] = windowDates(startISO, endISO, tz);

 const byCategory = new Map<ExpenseCategory, number>();
 const add = (cat: ExpenseCategory, cents: number) => byCategory.set(cat, (byCategory.get(cat) ?? 0) + cents);

 let perOrderRate = 0, perOrderApplied = 0, perOrderSales = 0;
 let monthlyRate = 0, monthlyApplied = 0, monthsSpanned = 0;

 for (const r of rates) {
  // A rate only counts from the day it started, clipped to this window.
  const effectiveFrom = r.occurredOn > from ? r.occurredOn : from;
  if (effectiveFrom > to) continue;

  if (r.recurs === "per_order") {
   let sales = 0;
   for (const [day, n] of salesOn) if (day >= effectiveFrom && day <= to) sales += n;
   const cents = r.amountCents * sales;
   perOrderRate += r.amountCents;
   perOrderApplied += cents;
   perOrderSales = Math.max(perOrderSales, sales);
   add(r.category, cents);
  } else {
   const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${effectiveFrom}T00:00:00Z`)) / 86_400_000 + 1;
   const months = Math.max(0, days) / DAYS_PER_MONTH;
   const cents = Math.round(r.amountCents * months);
   monthlyRate += r.amountCents;
   monthlyApplied += cents;
   monthsSpanned = Math.max(monthsSpanned, months);
   add(r.category, cents);
  }
 }

 return {
  byCategory,
  totalCents: perOrderApplied + monthlyApplied,
  perOrder: { rateCents: perOrderRate, sales: perOrderSales, appliedCents: perOrderApplied },
  monthly: { rateCents: monthlyRate, months: Math.round(monthsSpanned * 100) / 100, appliedCents: monthlyApplied },
 };
}
