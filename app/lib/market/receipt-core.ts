// A cash receipt's words, and the tag that remembers where the customer was met. Pure — no I/O.

/** `market:brick-lane` — the tag a stall customer carries into the customer list. */
export function marketTag(sessionName: string): string {
 const slug = String(sessionName || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
 return `market:${slug || "market"}`;
}

/** Loose: something@something.something, lower-cased. Nothing else gets a receipt. */
export function normalizeReceiptEmail(v: unknown): string | null {
 if (typeof v !== "string") return null;
 const e = v.trim().toLowerCase();
 return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

export type ReceiptInput = {
 storeName: string;
 sessionName: string;
 currency: string;
 lines: { title: string; saleCents: number }[];
 amountCents: number;
 tender: "cash" | "card" | string;
 tenderedCents: number | null;
 changeCents: number | null;
};

const money = (cents: number, currency: string) => {
 const whole = cents % 100 === 0;
 return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
};

/** Subject + a plain-text body the store-branded shell wraps (paragraphs split on blank lines). */
export function receiptCopy(r: ReceiptInput): { subject: string; body: string } {
 const cur = r.currency || "USD";
 const items = r.lines.map((l) => `${l.title} — ${money(l.saleCents, cur)}`).join("\n");
 const paid = r.tender === "cash" ? "Paid in cash" : "Paid by card";
 const change = r.tender === "cash" && r.tenderedCents != null && r.changeCents != null && r.changeCents > 0
  ? ` (${money(r.tenderedCents, cur)} given, ${money(r.changeCents, cur)} change)` : "";
 const body = [
  `Thanks for shopping with ${r.storeName} at ${r.sessionName}.`,
  items,
  `Total ${money(r.amountCents, cur)} · ${paid}${change}.`,
  `Keep this as your receipt. Reply to this email if you have any questions about your piece.`,
 ].join("\n\n");
 return { subject: `Your receipt from ${r.storeName}`, body };
}
