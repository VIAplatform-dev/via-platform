/**
 * Format a price with the correct currency symbol.
 * Examples: 125, "USD" → "$125"
 * 380, "GBP" → "£380"
 * 195, "AUD" → "A$195"
 * 200, "CAD" → "CA$200"
 * 150, "EUR" → "€150"
 */
export function formatPrice(price: number, currency?: string | null): string {
 const code = currency?.trim().toUpperCase() || "USD";
 return new Intl.NumberFormat("en-US", {
 style: "currency",
 currency: code,
 maximumFractionDigits: 0,
 }).format(price);
}

/**
 * Minor units → money with pennies only when there are any: 450 GBP → "£4.50", 800 GBP → "£8".
 * For shipping and other small sums where formatPrice's whole-unit rounding would turn £4.50 into £5.
 */
export function formatPriceCents(cents: number, currency?: string | null): string {
 const code = currency?.trim().toUpperCase() || "USD";
 const whole = Math.round(cents) % 100 === 0;
 return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** The symbol alone — "£", "$", "€", "A$" — for an input's prefix. Falls back to the code. */
export function currencySymbol(currency?: string | null): string {
 const code = currency?.trim().toUpperCase() || "USD";
 try {
 const part = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).formatToParts(1).find((p) => p.type === "currency");
 return part?.value || code;
 } catch {
 return code;
 }
}
