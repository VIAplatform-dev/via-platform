import { NextResponse } from "next/server";
import { getSourceNow } from "@/app/lib/data-layer/source-now-db";
import { unsentPicks, recordSent } from "@/app/lib/sourcing-alerts-db";
import { sendSourcingAlert } from "@/app/lib/email";
import { isStorePro } from "@/app/lib/store-plans-db";
import { isAutomationEnabled } from "@/app/lib/automations-db";
import { storeContactEmails } from "@/app/lib/stores";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Weekly: email each Pro store the sourcing opportunities that just entered the window — brands /
// categories / eras where VYA buyers' demand is rising and few stores carry them. Picks are market-
// wide (the same signal for everyone), but deduped PER STORE so a segment that stays hot for weeks
// isn't re-sent. Gated to Pro + the store's "sourcing_alerts" toggle (default on).
//   ?slug=<store>  → test-send to one store (ignores dedup, records nothing) — still requires the
//   Authorization header; the secret is never accepted via query string (it leaks into logs/Referer).
export async function GET(request: Request) {
 const { searchParams } = new URL(request.url);
 const testSlug = searchParams.get("slug");
 const cronSecret = process.env.CRON_SECRET;
 const authed = request.headers.get("authorization") === `Bearer ${cronSecret}`;
 if (!cronSecret || !authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 // The top few market-wide sourcing opportunities right now (7-day window).
 const { picks } = await getSourceNow("7d");
 const top = picks.slice(0, 5).map((p) => ({ segmentType: p.segmentType, segmentValue: p.segmentValue, score: p.score, trend: p.trend, reason: p.reason }));
 if (top.length === 0) return NextResponse.json({ ok: true, opportunities: 0, storesSent: 0 });

 const slugs = testSlug ? [testSlug] : Object.keys(storeContactEmails);
 let storesSent = 0;
 let skipped = 0;
 for (const slug of slugs) {
  if (!testSlug && slug === "via-admin") { skipped++; continue; } // skip the ops account on real runs
  if (!(await isStorePro(slug))) { skipped++; continue; }
  if (!(await isAutomationEnabled(slug, "sourcing_alerts"))) { skipped++; continue; }

  // Test mode sends the current top picks as-is (so you can re-test); the real run only sends what
  // the store hasn't seen in the last 14 days, and records those only after a successful send.
  const fresh = testSlug ? top : await unsentPicks(slug, top, 14);
  if (fresh.length === 0) { skipped++; continue; }

  const ok = await sendSourcingAlert(slug, fresh);
  if (ok) {
   if (!testSlug) await recordSent(slug, fresh);
   storesSent++;
  }
 }

 return NextResponse.json({ ok: true, opportunities: top.length, storesSent, skipped });
}
