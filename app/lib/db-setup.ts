// Guards for lazy, self-creating table setup — the `CREATE TABLE IF NOT EXISTS` on first use
// pattern the *-db.ts modules follow.
//
// The obvious implementation, `let ensured = false`, is wrong in two ways that only show up
// under concurrency, and both were hit for real while building the QR scan tables.

/**
 * Run `work` at most once, sharing the SAME in-flight promise with every concurrent caller.
 *
 * A boolean flag does not do this: callers arriving before the first one finishes all see it
 * false and all run the work. For CREATE TABLE that is not merely wasteful — Postgres races on
 * the SERIAL column's implicit sequence and one caller dies with a duplicate key in pg_class.
 *
 * A rejection is deliberately not cached, so one transient failure does not poison every later
 * call for the lifetime of the process.
 */
export function once<T>(work: () => Promise<T>): () => Promise<T> {
 let inFlight: Promise<T> | null = null;
 return () => {
  if (!inFlight) {
   inFlight = work().catch((e) => {
    inFlight = null;
    throw e;
   });
  }
  return inFlight;
 };
}

/**
 * Did this DDL fail only because someone else was creating the same object at the same moment?
 * `CREATE TABLE IF NOT EXISTS` is not atomic across connections: two callers racing it collide
 * on the SERIAL column's sequence in pg_class (23505) or on the table itself (42P07/42P16).
 * Each of those means the object now exists, which is all we wanted. Anything else — a bad
 * password, a denied permission, an unreachable host — must still surface.
 */
export function isDuplicateObjectError(e: unknown): boolean {
 const code = (e as { code?: unknown } | null)?.code;
 return code === "23505" || code === "42P07" || code === "42P16";
}

/**
 * The two guards together: run the schema setup once per process, and treat a losing race
 * against another process as success. `once()` covers concurrent callers inside one instance;
 * the duplicate check covers concurrent cold serverless instances, which have separate memory
 * and so cannot share the promise.
 */
export function ensureSchema(work: () => Promise<void>): () => Promise<void> {
 return once(async () => {
  try {
   await work();
  } catch (e) {
   if (!isDuplicateObjectError(e)) throw e;
  }
 });
}
