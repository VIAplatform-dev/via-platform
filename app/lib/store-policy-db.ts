import { neon } from "@neondatabase/serverless";

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
 policyText: string | null;            // the store's own words, shown to buyers
};

const DEFAULT: RefundPolicy = { refundsEnabled: true, returnWindowDays: 14, restockingFeePct: 0, returnShippingPaidBy: "buyer", policyText: null };

export async function getRefundPolicy(storeSlug: string): Promise<RefundPolicy> {
 try {
 await ensure();
 const rows = await db()`SELECT refunds_enabled, return_window_days, restocking_fee_pct, return_shipping_paid_by, policy_text FROM store_policies WHERE store_slug = ${storeSlug} LIMIT 1` as Array<Record<string, unknown>>;
 const r = rows[0];
 if (!r) return DEFAULT;
 return {
 refundsEnabled: r.refunds_enabled !== false,
 returnWindowDays: Number(r.return_window_days) || 0,
 restockingFeePct: Number(r.restocking_fee_pct) || 0,
 returnShippingPaidBy: r.return_shipping_paid_by === "store" ? "store" : "buyer",
 policyText: (r.policy_text as string | null) ?? null,
 };
 } catch {
 return DEFAULT;
 }
}

export async function setRefundPolicy(storeSlug: string, p: Partial<RefundPolicy>): Promise<RefundPolicy> {
 await ensure();
 const cur = await getRefundPolicy(storeSlug);
 const next: RefundPolicy = {
 refundsEnabled: p.refundsEnabled ?? cur.refundsEnabled,
 returnWindowDays: Math.max(0, Math.min(365, Math.round(p.returnWindowDays ?? cur.returnWindowDays))),
 restockingFeePct: Math.max(0, Math.min(50, Math.round(p.restockingFeePct ?? cur.restockingFeePct))),
 returnShippingPaidBy: (p.returnShippingPaidBy ?? cur.returnShippingPaidBy) === "store" ? "store" : "buyer",
 policyText: p.policyText !== undefined ? (p.policyText ? String(p.policyText).slice(0, 2000) : null) : cur.policyText,
 };
 await db()`
  INSERT INTO store_policies (store_slug, refunds_enabled, return_window_days, restocking_fee_pct, return_shipping_paid_by, policy_text, updated_at)
  VALUES (${storeSlug}, ${next.refundsEnabled}, ${next.returnWindowDays}, ${next.restockingFeePct}, ${next.returnShippingPaidBy}, ${next.policyText}, now())
  ON CONFLICT (store_slug) DO UPDATE SET
   refunds_enabled = ${next.refundsEnabled},
   return_window_days = ${next.returnWindowDays},
   restocking_fee_pct = ${next.restockingFeePct},
   return_shipping_paid_by = ${next.returnShippingPaidBy},
   policy_text = ${next.policyText},
   updated_at = now()
 `;
 return next;
}

/** One-line, buyer-facing summary of the policy — for the storefront + emails. */
export function policySummary(p: RefundPolicy): string {
 if (!p.refundsEnabled) return "All sales final.";
 const base = p.returnWindowDays > 0 ? `Returns accepted within ${p.returnWindowDays} days` : "Returns accepted — contact the store";
 return p.restockingFeePct > 0 ? `${base} · ${p.restockingFeePct}% restocking fee.` : `${base}.`;
}
