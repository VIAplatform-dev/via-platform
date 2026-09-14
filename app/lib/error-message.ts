/**
 * The whole story of a failure, as one line. Pure.
 *
 * WHY THIS EXISTS. An order insert failed seven times over a fortnight and every one of them was
 * recorded as:
 *
 *     Failed query: insert into "orders" ("id", "item_id", … ) values (…)
 *     params: f53e2f43-…, c6bf8c67-…, , , , , 64300, 0, 0, USD, , paid, …
 *
 * — the query and its parameters, and not one word about what was wrong with it. The reason
 * (`column "tax_jurisdiction" of relation "orders" does not exist`) was sitting on the driver error
 * that the ORM had wrapped, in `cause`, and nothing ever read it. Two weeks of sales with no order
 * behind them, and the log that was supposed to explain it explained nothing.
 *
 * So: walk the chain, and pick up what Postgres actually said along the way.
 */

/** Fields a Postgres driver error carries that are worth keeping. */
type PgLike = { code?: unknown; detail?: unknown; hint?: unknown; constraint?: unknown; column?: unknown; table?: unknown };

const str = (v: unknown): string => (typeof v === "string" && v.trim() ? v.trim() : "");

/** `code`, `detail`, `hint`, `constraint`, `column` — whichever the driver set. */
function pgBits(e: unknown): string[] {
 if (!e || typeof e !== "object") return [];
 const p = e as PgLike;
 const bits: string[] = [];
 // The SQLSTATE is the most useful five characters in the whole log line: 42703 is an unknown
 // column, 23505 a unique violation, 23503 a foreign key. It says which KIND of wrong this is.
 if (str(p.code)) bits.push(`code ${str(p.code)}`);
 if (str(p.constraint)) bits.push(`constraint ${str(p.constraint)}`);
 if (str(p.column)) bits.push(`column ${str(p.column)}`);
 if (str(p.detail)) bits.push(str(p.detail));
 if (str(p.hint)) bits.push(`hint: ${str(p.hint)}`);
 return bits;
}

/**
 * One line: the error's own message, then each wrapped cause beneath it, then whatever the database
 * driver attached. Repeats are dropped — an ORM often copies the driver's message onto its own, and
 * saying it twice helps nobody.
 *
 * `max` is the column width the log has for it, and the message is cut to fit.
 */
export function describeError(err: unknown, max = 2000): string {
 const parts: string[] = [];
 const push = (v: string) => { const t = v.trim(); if (t && !parts.includes(t)) parts.push(t); };

 let cur: unknown = err;
 // Bounded: a cause chain can be circular, and a logger must never be the thing that hangs.
 for (let depth = 0; cur && depth < 5; depth++) {
  if (cur instanceof Error) {
   push(cur.message);
   for (const b of pgBits(cur)) push(b);
   // Some drivers hang the original on `sourceError` rather than the standard `cause`.
   const next = (cur as { cause?: unknown }).cause ?? (cur as { sourceError?: unknown }).sourceError;
   cur = next;
   continue;
  }
  if (typeof cur === "object") {
   const m = str((cur as { message?: unknown }).message);
   if (m) push(m);
   for (const b of pgBits(cur)) push(b);
   cur = (cur as { cause?: unknown }).cause;
   continue;
  }
  push(String(cur));
  break;
 }

 const line = parts.join(" — ") || "Unknown error";
 return line.length > max ? line.slice(0, max - 1) + "…" : line;
}
