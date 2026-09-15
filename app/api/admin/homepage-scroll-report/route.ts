import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";

function isAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const token = request.cookies.get("via_admin_token")?.value;
  return token === createHash("sha256").update(adminPassword).digest("hex");
}

const SECTION_ORDER = [
  "hero", "how-it-works", "favorites", "collections",
  "stores", "new-arrivals", "categories",
];

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
  const sql = neon(dbUrl);

  const days = parseInt(request.nextUrl.searchParams.get("days") ?? "30");

  try {
    // Total unique sessions (each user_id + day combo = one homepage visit session)
    // For anonymous users we count each event as its own session
    const rows = await sql`
      SELECT
        section,
        COUNT(*)::int AS total_views,
        COUNT(DISTINCT COALESCE(user_id, id::text))::int AS unique_sessions
      FROM homepage_scroll_events
      WHERE timestamp >= NOW() - (${days} || ' days')::interval
      GROUP BY section
    `;

    const bySection = new Map<string, { total: number; unique: number }>();
    for (const row of rows) {
      bySection.set(row.section as string, {
        total: row.total_views as number,
        unique: row.unique_sessions as number,
      });
    }

    // Hero reach = the baseline (100% by definition, if you're on the homepage you see the hero)
    const heroUnique = bySection.get("hero")?.unique ?? 0;

    const sections = SECTION_ORDER.map((section) => {
      const data = bySection.get(section);
      const unique = data?.unique ?? 0;
      const reachPct = heroUnique > 0 ? Math.round((unique / heroUnique) * 100) : 0;
      return { section, unique, reachPct };
    });

    return NextResponse.json({ sections, heroBaseline: heroUnique, days });
  } catch {
    // Table might not exist yet
    return NextResponse.json({
      sections: SECTION_ORDER.map((s) => ({ section: s, unique: 0, reachPct: 0 })),
      heroBaseline: 0,
      days,
      note: "No data yet: table will be created on first homepage visit after deployment",
    });
  }
}
