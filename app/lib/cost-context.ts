// ".js" so Node's native TS test runner can resolve it, matching the rest of app/lib.
import { AsyncLocalStorage } from "node:async_hooks";

// ───────────────────────────────────────────────────────────────────────────
// Who is this API call FOR?
//
// api_costs has had `store_slug` and `item_id` columns and a ctx parameter since it was built, and
// not one caller ever passed them: 19,038 calls and $96 in a month, every row attributed to nobody.
// For a business charging a subscription, "what does it cost to serve this store each month" is THE
// unit-economics question, and the data could not answer it.
//
// The reason nothing passed a store isn't carelessness — it's that the spend happens four layers
// down. `serp()` inside comps.ts has no idea a seller upload started it, and threading a slug
// through every signature between them would touch dozens of call sites for one logging field.
//
// So the store is set ONCE at the request boundary and read wherever the money is actually spent.
// Scripts and cron jobs set nothing and stay unattributed, which is correct and useful: it is what
// separates "sellers cost us this much" from "our own eval runs cost us this much".
// ───────────────────────────────────────────────────────────────────────────

export type CostContext = { storeSlug?: string | null; itemId?: string | null };

const store = new AsyncLocalStorage<CostContext>();

/**
 * Attribute everything spent from here on in this request to a store.
 *
 * `enterWith` rather than `run(fn)` so a route handler can call it as a single line after it
 * resolves the seller, instead of indenting its whole body inside a callback.
 */
export function attributeCostsTo(ctx: CostContext): void {
 try {
  store.enterWith({ storeSlug: ctx.storeSlug ?? null, itemId: ctx.itemId ?? null });
 } catch {
  // Non-Node runtimes have no async_hooks. Losing an attribution label must never cost a request.
 }
}

/** The store this call belongs to, or an empty context outside a request. */
export function currentCostContext(): CostContext {
 try {
  return store.getStore() ?? {};
 } catch {
  return {};
 }
}
