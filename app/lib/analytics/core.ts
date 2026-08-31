import { neon } from "@neondatabase/serverless";
import type { Granularity, Window } from "./period";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — shared plumbing for the store suite.
//
// Every metric module below this file follows the same three rules:
//   1. Scope by seller id (resolved once, in the suite), never by re-joining slug.
//   2. Take a resolved Window — no module invents its own idea of "this period".
//   3. Degrade to zeros, never throw. A fresh store, or a table an older
//      deployment hasn't created yet, must render an empty dashboard rather
//      than a 500. `safe()` is the one place that policy lives.
// ───────────────────────────────────────────────────────────────────────────

export function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

/**
 * The order statuses that count as a realised sale. Money has moved and the sale
 * stands: `fulfilled` is a terminal success alongside paid/shipped/delivered.
 * `pending` hasn't been paid, `cancelled`/`refunded` are explicitly not revenue.
 * Exported so every surface reports the same GMV — there is exactly one
 * definition of "sold" in the product.
 */
export const SOLD_STATUSES = ["paid", "shipped", "delivered", "fulfilled"];

export type SellerRef = { id: string; slug: string; name: string; createdAt: string | null };

export async function resolveSeller(slug: string): Promise<SellerRef | null> {
 const rows = (await db()`SELECT id, slug, name, created_at FROM sellers WHERE slug = ${slug} LIMIT 1`) as Array<Record<string, unknown>>;
 const r = rows[0];
 if (!r) return null;
 return { id: String(r.id), slug: String(r.slug), name: String(r.name), createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : null };
}

export type Row = Record<string, unknown>;
type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;

/**
 * The same Neon client as `db()`, typed to return plain rows. Every query in the
 * metric modules goes through this, so none of them carry an inline cast and
 * `.catch(() => [])` on an optional table type-checks like any other promise.
 */
export function sqlRows(): SqlTag {
 return db() as unknown as SqlTag;
}

/** Run a query set, falling back to `fallback` on any failure. See the rules above. */
export async function safe<T>(fn: () => Promise<T>, fallback: T, tag: string): Promise<T> {
 try {
  return await fn();
 } catch (err) {
  // Visible in logs (a missing column is worth fixing) but never fatal to the request.
  console.warn(`[analytics:${tag}]`, err instanceof Error ? err.message : err);
  return fallback;
 }
}

// ── numeric helpers ────────────────────────────────────────────────────────

export const num = (v: unknown): number => {
 const n = Number(v ?? 0);
 return Number.isFinite(n) ? n : 0;
};
export const int = (v: unknown): number => Math.round(num(v));

/** A rate as a percentage with one decimal, and 0 rather than NaN on an empty denominator. */
export const ratePct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/** Integer-cents mean, guarding the empty case. */
export const meanCents = (total: number, count: number): number => (count > 0 ? Math.round(total / count) : 0);

/** Median of a numeric list (computed in JS — the sets here are small). */
export function median(values: number[]): number | null {
 const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
 if (!xs.length) return null;
 const mid = xs.length >> 1;
 return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** Linear-interpolated quantile, matching the convention used in data-layer/metrics.ts. */
export function quantile(values: number[], q: number): number | null {
 const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
 if (!xs.length) return null;
 const pos = (xs.length - 1) * q;
 const lo = Math.floor(pos);
 const hi = Math.ceil(pos);
 return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

/** Where `value` sits within `population`, 0–100. Null when there's nothing to rank against. */
export function percentileOf(value: number | null, population: number[]): number | null {
 if (value == null || population.length < 2) return null;
 const below = population.filter((v) => v < value).length;
 return Math.round((below / population.length) * 100);
}

// ── SQL fragments ──────────────────────────────────────────────────────────

/**
 * The `date_trunc` unit for a granularity. Postgres accepts the unit as a bind
 * parameter, so callers pass this straight into the query rather than
 * interpolating — no string building anywhere near the SQL.
 */
export function truncUnit(g: Granularity): string {
 return g === "day" ? "day" : g === "week" ? "week" : "month";
}

/** A window's bounds as the [start, end) pair every query takes. */
export function bounds(w: Window): [string, string] {
 return [w.startISO, w.endISO];
}

/**
 * Fill a bucketed series so a chart has a continuous x-axis: any bucket with no
 * rows becomes an explicit zero instead of a gap the line jumps over. The walk
 * starts on the same boundary Postgres `date_trunc` lands on (weeks begin
 * Monday), so generated buckets line up with returned ones instead of doubling.
 */
export function fillSeries<T extends { bucket: string }>(rows: T[], w: Window, g: Granularity, zero: (bucket: string) => T): T[] {
 const byBucket = new Map(rows.map((r) => [r.bucket, r]));
 const end = new Date(w.endISO);
 const start = new Date(w.startISO);
 const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
 if (g === "month") cur.setUTCDate(1);
 // Postgres weeks start Monday; JS getUTCDay() has Sunday at 0.
 if (g === "week") cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() + 6) % 7));

 const out: T[] = [];
 // Bounded so a pathological window can never spin: 800 buckets is ~2 years of days.
 for (let i = 0; cur < end && i < 800; i++) {
  const key = cur.toISOString().slice(0, 10);
  out.push(byBucket.get(key) ?? zero(key));
  byBucket.delete(key);
  if (g === "day") cur.setUTCDate(cur.getUTCDate() + 1);
  else if (g === "week") cur.setUTCDate(cur.getUTCDate() + 7);
  else cur.setUTCMonth(cur.getUTCMonth() + 1);
 }
 // Anything the DB returned outside the walk (a timezone edge) still belongs on the chart.
 for (const leftover of byBucket.values()) out.push(leftover);
 return out.sort((a, b) => a.bucket.localeCompare(b.bucket));
}
