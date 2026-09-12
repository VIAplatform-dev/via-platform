// The Discounts screen's small decisions, kept testable.

export type DiscountKind = "percent" | "fixed";

/**
 * A code as it will actually be typed at checkout.
 *
 * Uppercased and stripped of everything that isn't a letter, digit, dash or underscore. A seller
 * types "spring 20" or pastes "SPRING20 " with a trailing space from a note; a buyer types SPRING20
 * and is told the code doesn't exist. Normalising here means the code she is shown on this screen is
 * the code that works.
 */
export function normalizeCode(v: string | null | undefined): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
}

/**
 * The value to send, or null when the box is empty.
 *
 * A percentage is whole and capped at 100 — "110% off" is a refund with extra steps. A fixed amount
 * is left as typed (minor units are the server's business) beyond refusing something negative.
 */
export function discountValueFromText(v: string | null | undefined, kind: DiscountKind): number | null {
  const t = String(v ?? "").replace(/[^0-9.]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return kind === "percent" ? Math.min(100, Math.round(n)) : n;
}

/** The line under a code: what it does and how often it's been used. */
export function describeDiscount(d: {
  label?: string | null;
  kind?: string | null;
  value?: number | null;
  used?: number | null;
}): string {
  const what =
    d.label?.trim() ||
    (d.kind === "percent" && d.value != null
      ? `${d.value}% off`
      : d.value != null
        ? `${d.value} off`
        : "Discount");
  // Zero uses is worth saying — it is the answer to "is this code working?" — but only once a code
  // is real. `used` absent means the server didn't count, which is not the same as nobody using it.
  return typeof d.used === "number" ? `${what} · ${d.used} used` : what;
}
