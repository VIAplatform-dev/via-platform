// Pure money rules for a market sale: per-item discounts, cart totals, change due. No I/O.

export type Discount = { type: "percent" | "fixed" | "price"; value: number } | null;
export type CartLine = { itemId: string; listCents: number; saleCents: number };

/** The price actually charged for one item after a per-sale discount (never rewrites the listing). */
export function applyDiscount(listCents: number, d: Discount): number {
 if (!d) return listCents;
 let out = listCents;
 if (d.type === "percent") out = Math.round(listCents * (1 - d.value / 100));
 else if (d.type === "fixed") out = listCents - Math.round(d.value);
 else if (d.type === "price") out = Math.round(d.value);
 return Math.max(0, Math.min(listCents, out));
}

export function cartTotals(lines: CartLine[]): { listCents: number; saleCents: number; discountCents: number; count: number } {
 const listCents = lines.reduce((s, l) => s + l.listCents, 0);
 const saleCents = lines.reduce((s, l) => s + l.saleCents, 0);
 return { listCents, saleCents, discountCents: listCents - saleCents, count: lines.length };
}

/** Cash: what to hand back. null when nothing was tendered or the tender is short. */
export function changeDue(saleCents: number, tenderedCents: number | null): number | null {
 if (tenderedCents == null || !Number.isFinite(tenderedCents)) return null;
 if (tenderedCents < saleCents) return null;
 return Math.round(tenderedCents - saleCents);
}

/** Clean a cart from the client: unique item ids, integers, 0 ≤ sale ≤ list. */
export function normalizeCart(raw: unknown): CartLine[] {
 const seen = new Set<string>();
 const out: CartLine[] = [];
 for (const r of Array.isArray(raw) ? raw : []) {
 const itemId = typeof r?.itemId === "string" ? r.itemId.trim() : "";
 if (!itemId || seen.has(itemId)) continue;
 const listCents = Math.max(0, Math.round(Number(r?.listCents) || 0));
 const saleCents = Math.max(0, Math.min(listCents, Math.round(Number(r?.saleCents ?? listCents) || 0)));
 seen.add(itemId);
 out.push({ itemId, listCents, saleCents });
 }
 return out.slice(0, 20);
}
