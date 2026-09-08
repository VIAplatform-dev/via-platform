import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { listSellers } from "@/app/lib/db/sellers";
import { setupInputFor } from "@/app/lib/setup-status-db";
import { setupSteps, setupSummary } from "@/app/lib/setup-core";
import { funnelByStep, stuckSinceDays, type FunnelStore } from "@/app/lib/setup-funnel-core";

export const dynamic = "force-dynamic";

// Where stores get stuck. Owner-only. Every store with a sellers row (= a workspace), its setup
// checklist computed exactly as its own Home computes it (setup-status-db.ts), rolled up per step
// (setup-funnel-core.ts). "Stuck since" = days since the sellers row was created.
//
// Stores are read in small batches: each one is seven cheap queries, and forty-five at once would
// lean on the connection pool harder than an admin page needs to.
const BATCH = 12;

export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
  const sellers = await listSellers();
  const now = new Date();
  const stores: FunnelStore[] = [];
  for (let i = 0; i < sellers.length; i += BATCH) {
   const rows = await Promise.all(sellers.slice(i, i + BATCH).map(async (s) => {
    const steps = setupSteps(await setupInputFor(s.slug));
    const sum = setupSummary(steps);
    return { slug: s.slug, name: s.name || s.slug, next: sum.next?.id ?? null, nextLabel: sum.next?.label ?? null, done: sum.done, total: sum.total, complete: sum.complete, stuckSinceDays: stuckSinceDays(s.createdAt, now) };
   }));
   stores.push(...rows);
  }
  // Longest-stuck first; finished stores at the bottom.
  stores.sort((a, b) => Number(a.complete) - Number(b.complete) || b.stuckSinceDays - a.stuckSinceDays || a.slug.localeCompare(b.slug));
  return NextResponse.json({ ok: true, stores, byStep: funnelByStep(stores), total: stores.length, complete: stores.filter((s) => s.complete).length });
 } catch (e) {
  return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Funnel failed." }, { status: 500 });
 }
}
