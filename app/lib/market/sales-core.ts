// Pure sales roll-up for a market session — no DB, unit-tested.

export type SaleLike = { amountCents: number; status: string; tender: string | null; discountCents?: number | null };

export type SalesSummary = {
 count: number; // paid (non-refunded) sales
 grossCents: number;
 avgCents: number;
 refundedCount: number;
 byTender: Record<string, number>; // gross per tender
 discountCents: number; // total knocked off list prices
};

export function summarizeSales(rows: SaleLike[]): SalesSummary {
 let count = 0, grossCents = 0, refundedCount = 0, discountCents = 0;
 const byTender: Record<string, number> = {};
 for (const r of rows) {
 if (r.status === "refunded" || r.status === "cancelled") { refundedCount++; continue; }
 count++;
 grossCents += r.amountCents;
 discountCents += r.discountCents ?? 0;
 const t = r.tender || "other";
 byTender[t] = (byTender[t] ?? 0) + r.amountCents;
 }
 return { count, grossCents, avgCents: count ? Math.round(grossCents / count) : 0, refundedCount, byTender, discountCents };
}
