// Where stores get stuck — the owner's view of the setup checklist across every store.
//
// "If 3 sellers out of 10 get stuck somewhere, we need to explain better." Each incomplete store
// counts once, against the step it is stuck on (its `next`); the percentage is of ALL stores, so
// the bars read as "3 of 10", not "3 of the 5 who haven't finished". Complete stores sit in the
// table and never in a bar. The domain never blocks, so it is never a bar either.
//
// "Stuck since" is days since the store's sellers.created_at — the cheapest honest number: it is
// how long she has had a workspace without finishing. Activity-based ages would need a scan of
// items and orders per store on every load.

import { setupSteps, type SetupStepId } from "./setup-core.ts";

export type FunnelStore = {
 slug: string;
 name: string;
 /** The step the store is stuck on; null when every required step is done. */
 next: SetupStepId | null;
 done: number;
 total: number;
 complete: boolean;
 stuckSinceDays: number;
};

export type FunnelStep = {
 id: SetupStepId;
 label: string;
 /** Stores stuck on this step. */
 count: number;
 /** Of all stores, rounded. */
 pct: number;
 avgStuckDays: number;
};

const NO_FLAGS = { shipFromSet: false, paymentsConnected: false, chargesEnabled: false, shippingConfigured: false, servedZoneCount: 0, liveListings: 0, policySet: false, customDomain: null };

/** One bar per required step, most stuck-on first (ties keep the checklist's order). */
export function funnelByStep(stores: FunnelStore[]): FunnelStep[] {
 const total = stores.length;
 const bars = setupSteps(NO_FLAGS).filter((s) => !s.optional).map((s, order) => {
  const stuck = stores.filter((st) => !st.complete && st.next === s.id);
  const count = stuck.length;
  return {
   order,
   id: s.id,
   label: s.label,
   count,
   pct: total ? Math.round((count / total) * 100) : 0,
   avgStuckDays: count ? Math.round(stuck.reduce((n, st) => n + st.stuckSinceDays, 0) / count) : 0,
  };
 });
 return bars.sort((a, b) => b.count - a.count || a.order - b.order).map((b) => ({ id: b.id, label: b.label, count: b.count, pct: b.pct, avgStuckDays: b.avgStuckDays }));
}

/** Whole days between when the seller row was created and now; 0 for unknown or future dates. */
export function stuckSinceDays(createdAt: Date | string | null | undefined, now = new Date()): number {
 if (!createdAt) return 0;
 const t = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
 if (!Number.isFinite(t)) return 0;
 return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}
