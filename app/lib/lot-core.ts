// A lot: several pieces bought together for one price. Pure — no I/O.
//
// "These 20 cost £340" is how she actually buys; a per-piece cost is something she works out
// later, if ever. Splitting the lot writes a cost onto every piece so the margin report can
// count them, and the split has to add up to the penny — anything else is a number she can't
// reconcile with her bank statement. The phone mirrors this in mobile/lib/seller/lot.ts.

/**
 * Split `totalCents` across `ids`. With `weights` (usually list prices in cents), each piece
 * carries its share of the total in proportion; any piece whose weight is missing or zero makes
 * the split fall back to equal, so no piece is starved. Remainder pennies go to the first pieces.
 */
export function splitLotCost(totalCents: number, ids: string[], weights?: Record<string, number | null | undefined>): Record<string, number> {
 const out: Record<string, number> = {};
 if (!ids.length) return out;
 const total = Math.max(0, Math.round(Number(totalCents) || 0));
 const w = ids.map((id) => Math.max(0, Math.round(Number(weights?.[id]) || 0)));
 const proportional = weights != null && w.every((x) => x > 0);
 const sumW = proportional ? w.reduce((s, x) => s + x, 0) : ids.length;
 let allotted = 0;
 ids.forEach((id, i) => {
  const share = Math.floor((total * (proportional ? w[i] : 1)) / sumW);
  out[id] = share;
  allotted += share;
 });
 let rest = total - allotted;
 for (const id of ids) {
  if (rest <= 0) break;
  out[id] += 1;
  rest -= 1;
 }
 return out;
}

/** A short random id that ties a batch together — so "the Tuesday lot" can be found again. */
export function newLotId(): string {
 const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
 let s = "";
 for (let i = 0; i < 12; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
 return `lot_${s}`;
}

/** Today as the plain date the acquired_at column takes — the default on a batch's "Acquired on". */
export function todayISO(now: Date = new Date()): string {
 return now.toISOString().slice(0, 10);
}

/** A plain YYYY-MM-DD (the date column's format), from a date or an ISO stamp; anything else is null. */
export function parseAcquiredAt(v: unknown): string | null {
 if (typeof v !== "string") return null;
 const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
 if (!m) return null;
 const [, y, mo, d] = m;
 const mm = Number(mo), dd = Number(d);
 if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
 return `${y}-${mo}-${d}`;
}
