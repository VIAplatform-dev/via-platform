import { neon } from "@neondatabase/serverless";

// DB-backed per-IP rate limiter. In-memory wouldn't hold across the serverless instances Vercel
// spins up, so a flood would slip through. Shared table, keyed by (bucket, ip). Fail-open: if the
// limiter itself errors we never block a legitimate request.

function getSql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}
type Sql = ReturnType<typeof getSql>;

let tableReady = false;
async function ensureTable(sql: Sql) {
 if (tableReady) return;
 await sql`CREATE TABLE IF NOT EXISTS rate_limit_hits (bucket TEXT NOT NULL, ip TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
 await sql`CREATE INDEX IF NOT EXISTS idx_rate_limit_hits ON rate_limit_hits (bucket, ip, created_at)`;
 tableReady = true;
}

export function clientIp(headers: Headers): string {
 const xff = headers.get("x-forwarded-for");
 if (xff) return xff.split(",")[0].trim();
 return headers.get("x-real-ip") || "unknown";
}

/**
 * Returns true if this IP is OVER the limit for `bucket` (and does not log the attempt).
 * Returns false when under (and logs the attempt). windowMinutes is an integer, bound as a
 * parameter, so the interval literal is never string-built from untrusted input.
 */
export async function overRateLimit(opts: {
 bucket: string;
 ip: string;
 max: number;
 windowMinutes: number;
}): Promise<boolean> {
 try {
  const sql = getSql();
  await ensureTable(sql);
  const { bucket, ip, max, windowMinutes } = opts;
  const recent = (await sql`
    SELECT count(*)::int AS n FROM rate_limit_hits
    WHERE bucket = ${bucket} AND ip = ${ip}
      AND created_at >= now() - (${windowMinutes} || ' minutes')::interval
  `) as { n: number }[];
  if ((recent[0]?.n ?? 0) >= max) return true;
  await sql`INSERT INTO rate_limit_hits (bucket, ip) VALUES (${bucket}, ${ip})`;
  // Opportunistic cleanup so the table can't grow unbounded under a distributed flood.
  if (Math.random() < 0.02) {
   await sql`DELETE FROM rate_limit_hits WHERE created_at < now() - interval '2 days'`.catch(() => {});
  }
  return false;
 } catch {
  return false; // never block a legitimate request if the limiter errors
 }
}
