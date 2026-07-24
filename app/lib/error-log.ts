/* eslint-disable @typescript-eslint/no-explicit-any */
import { neon } from "@neondatabase/serverless";
import { sendOpsAlert } from "./ops-alert";

// Error-monitoring foundation. The codebase had no telemetry, so failures on important paths
// vanished into swallowed catches (the sold_items bug hid for MONTHS this way). logError() records
// a failure to a queryable table, always console.errors it (the floor — works even when the DB is
// what failed), and for 'critical' emails ops (throttled). An admin dashboard reads getRecentErrors/
// getErrorSummary. The whole point: silent failures become visible.

export type ErrorSeverity = "warn" | "error" | "critical";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS error_log (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log (created_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_error_log_source ON error_log (source, created_at DESC)`;
 ensured = true;
}

// Throttle critical email alerts per source so a hot loop can't flood the ops inbox. (In-memory, so
// per-instance on serverless — imperfect but enough to prevent a storm.)
const lastAlert = new Map<string, number>();
const ALERT_THROTTLE_MS = 10 * 60 * 1000;

/**
 * Record a failure that would otherwise be swallowed. NEVER THROWS — an error logger that throws
 * would mask the very failure it's recording, so every step is best-effort.
 */
export async function logError(source: string, err: unknown, opts?: { context?: Record<string, unknown>; severity?: ErrorSeverity }): Promise<void> {
 const severity = opts?.severity ?? "error";
 const message = err instanceof Error ? err.message : String(err);
 console.error(`[${source}] ${message}`, opts?.context ?? "");
 try {
 await ensureTable();
 await db()`INSERT INTO error_log (source, severity, message, context)
  VALUES (${source}, ${severity}, ${message.slice(0, 2000)}, ${opts?.context ? JSON.stringify(opts.context).slice(0, 4000) : null}::jsonb)`;
 } catch { /* the logger must never throw */ }
 if (severity === "critical") {
 const now = Date.now();
 if (now - (lastAlert.get(source) ?? 0) > ALERT_THROTTLE_MS) {
 lastAlert.set(source, now);
 await sendOpsAlert(`${source} (critical)`, `${message}\n\n${opts?.context ? JSON.stringify(opts.context, null, 2) : ""}`).catch(() => {});
 }
 }
}

export type ErrorRow = { id: number; source: string; severity: string; message: string; context: unknown; createdAt: string };

export async function getRecentErrors(opts?: { limit?: number; source?: string; severity?: string; sinceHours?: number }): Promise<ErrorRow[]> {
 await ensureTable();
 const limit = Math.max(1, Math.min(500, opts?.limit ?? 100));
 const h = Math.max(1, Math.min(720, opts?.sinceHours ?? 168));
 const rows = (await db()`
  SELECT id, source, severity, message, context, created_at FROM error_log
  WHERE created_at >= now() - (${h} || ' hours')::interval
  ORDER BY created_at DESC LIMIT ${limit}
 `.catch(() => [])) as any[];
 return rows
 .filter((r) => !opts?.source || r.source === opts.source)
 .filter((r) => !opts?.severity || r.severity === opts.severity)
 .map((r) => ({ id: Number(r.id), source: String(r.source), severity: String(r.severity), message: String(r.message), context: r.context ?? null, createdAt: String(r.created_at) }));
}

/** Roll-up for the dashboard: counts by source + severity over the window, worst first. */
export async function getErrorSummary(sinceHours = 168): Promise<{ source: string; severity: string; count: number; lastAt: string }[]> {
 await ensureTable();
 const h = Math.max(1, Math.min(720, sinceHours));
 const rows = (await db()`
  SELECT source, severity, COUNT(*)::int AS count, MAX(created_at) AS last_at FROM error_log
  WHERE created_at >= now() - (${h} || ' hours')::interval
  GROUP BY source, severity ORDER BY count DESC
 `.catch(() => [])) as any[];
 return rows.map((r) => ({ source: String(r.source), severity: String(r.severity), count: Number(r.count), lastAt: String(r.last_at) }));
}
