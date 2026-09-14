import { neon } from "@neondatabase/serverless";
import { getStoreProfile, updateStoreProfile } from "./store-profile-db";
import { resolveReturnsText } from "./returns-policy";

// A store's return / refund policy — the "some stores are all-sales-final, some accept returns"
// choice. Buyer-facing (shown on the storefront + order emails) and the store's own setting. The
// store issuing a manual refund is always allowed; this governs what buyers are TOLD to expect.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensure() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_policies (
  store_slug TEXT PRIMARY KEY,
  refunds_enabled BOOLEAN NOT NULL DEFAULT true,
  return_window_days INT NOT NULL DEFAULT 14,
  policy_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 // A restocking fee (percent of the item price) the store keeps on a return; 0 = none.
 await sql`ALTER TABLE store_policies ADD COLUMN IF NOT EXISTS restocking_fee_pct INT NOT NULL DEFAULT 0`.catch(() => {});
 // Who pays for return shipping: 'buyer' (deducted from their refund) or 'store' (store absorbs it).
 await sql`ALTER TABLE store_policies ADD COLUMN IF NOT EXISTS return_shipping_paid_by TEXT NOT NULL DEFAULT 'buyer'`.catch(() => {});
 ensured = true;
}

export type ReturnShippingPaidBy = "buyer" | "store";
export type RefundPolicy = {
 refundsEnabled: boolean;              // false = all sales final
 returnWindowDays: number;             // how long a buyer has to return (0 = "at our discretion")
 restockingFeePct: number;             // % of the item price kept on a return (0 = none)
 returnShippingPaidBy: ReturnShippingPaidBy; // who pays return shipping
 /**
  * The store's own words, shown to buyers.
  *
  * ONE RECORD, and it is `store_profiles.policies.returns` — the page the storefront links to.
  * This used to be a second, unrelated paragraph in `store_policies.policy_text`, written on a
  * different screen, so a store could have two contradicting returns policies and no way to tell
  * which a buyer was owed. The old column is still READ, so nothing a seller wrote is lost, and
  * never written to again. See returns-policy.ts.
  */
 policyText: string | null;
};

const DEFAULT: RefundPolicy = { refundsEnabled: true, returnWindowDays: 14, restockingFeePct: 0, returnShippingPaidBy: "buyer", policyText: null };

export async function getRefundPolicy(storeSlug: string): Promise<RefundPolicy> {
 try {
 await ensure();
 // Both records, resolved to one. Done HERE rather than at each call site because there are
 // several — the storefront product page, the order emails, the settings screens — and one of
 // them reading the other record is exactly the bug this merge exists to end.
 const [rows, profile] = await Promise.all([
 db()`SELECT refunds_enabled, return_window_days, restocking_fee_pct, return_shipping_paid_by, policy_text FROM store_policies WHERE store_slug = ${storeSlug} LIMIT 1` as Promise<Array<Record<string, unknown>>>,
 getStoreProfile(storeSlug).catch(() => null),
 ]);
 const text = resolveReturnsText(profile?.policies?.returns, (rows[0]?.policy_text as string | null) ?? null);
 const r = rows[0];
 if (!r) return { ...DEFAULT, policyText: text || null };
 return {
 refundsEnabled: r.refunds_enabled !== false,
 returnWindowDays: Number(r.return_window_days) || 0,
 restockingFeePct: Number(r.restocking_fee_pct) || 0,
 returnShippingPaidBy: r.return_shipping_paid_by === "store" ? "store" : "buyer",
 policyText: text || null,
 };
 } catch {
 return DEFAULT;
 }
}

/** Has the store DECIDED its returns policy? A saved row, whichever way it went — all-sales-final
 *  is a policy too. getRefundPolicy returns a default for a store that never chose, which is
 *  right for buyers and wrong for "Set up your store". */
export async function hasRefundPolicy(storeSlug: string): Promise<boolean> {
 await ensure();
 const rows = await db()`SELECT 1 FROM store_policies WHERE store_slug = ${storeSlug} LIMIT 1`;
 return rows.length > 0;
}

export async function setRefundPolicy(storeSlug: string, p: Partial<RefundPolicy>): Promise<RefundPolicy> {
 await ensure();
 const cur = await getRefundPolicy(storeSlug);
 const next: RefundPolicy = {
 refundsEnabled: p.refundsEnabled ?? cur.refundsEnabled,
 returnWindowDays: Math.max(0, Math.min(365, Math.round(p.returnWindowDays ?? cur.returnWindowDays))),
 restockingFeePct: Math.max(0, Math.min(50, Math.round(p.restockingFeePct ?? cur.restockingFeePct))),
 returnShippingPaidBy: (p.returnShippingPaidBy ?? cur.returnShippingPaidBy) === "store" ? "store" : "buyer",
 policyText: p.policyText !== undefined ? (p.policyText ? String(p.policyText).trim().slice(0, 20_000) : null) : cur.policyText,
 };

 // THE TEXT GOES TO THE ONE RECORD, whichever screen typed it.
 //
 // Saving here used to write a second copy into this table's own column, which is how two policies
 // came to exist. It now lands in store_profiles.policies.returns — the same field the Policies
 // page edits — so the rules screen and the policy page are two views of one thing.
 //
 // Only when the caller actually sent text. A save of just the window or the fee must not touch her
 // policy, and `p.policyText === undefined` is the difference between "left alone" and "cleared".
 if (p.policyText !== undefined) {
 await updateStoreProfile(storeSlug, { policies: { returns: next.policyText ?? "" } }).catch(() => {});
 }
 await db()`
  INSERT INTO store_policies (store_slug, refunds_enabled, return_window_days, restocking_fee_pct, return_shipping_paid_by, policy_text, updated_at)
  VALUES (${storeSlug}, ${next.refundsEnabled}, ${next.returnWindowDays}, ${next.restockingFeePct}, ${next.returnShippingPaidBy}, NULL, now())
  ON CONFLICT (store_slug) DO UPDATE SET
   refunds_enabled = ${next.refundsEnabled},
   return_window_days = ${next.returnWindowDays},
   restocking_fee_pct = ${next.restockingFeePct},
   return_shipping_paid_by = ${next.returnShippingPaidBy},
   updated_at = now()
 `;
 // policy_text is deliberately absent from the UPDATE. It is the legacy copy: left exactly as the
 // seller last left it, still read as a fallback for a store that has not saved since the merge,
 // and never written again. Clearing it here would delete words a store wrote — see returns-policy.ts.
 return next;
}

/** One-line, buyer-facing summary of the policy — for the storefront + emails. */
export function policySummary(p: RefundPolicy): string {
 if (!p.refundsEnabled) return "All sales final.";
 const base = p.returnWindowDays > 0 ? `Returns accepted within ${p.returnWindowDays} days` : "Returns accepted — contact the store";
 return p.restockingFeePct > 0 ? `${base} · ${p.restockingFeePct}% restocking fee.` : `${base}.`;
}
