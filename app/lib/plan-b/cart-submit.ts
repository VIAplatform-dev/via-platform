// What a POST to /cart actually means.
//
// Shopify's cart page and cart drawer are ONE form with TWO submit buttons:
//
//   <form action="/cart" method="post">
//     <button type="submit" name="update">Update</button>
//     <button type="submit" name="checkout">Check out</button>
//   </form>
//
// A browser sends only the pressed button's name, so the body is the only thing that says which the
// shopper wanted. That makes this the difference between recalculating a bag and starting a payment,
// which is why it is a tested pure function rather than a condition buried in a route.
//
// An audit of the stored captures found this exact form on 16 of 18 Shopify stores, and on 7 of them
// the drawer carrying it is in the header of EVERY page — so this is the main way a shopper on a
// hosted storefront reaches checkout.

export type CartSubmit =
 | { kind: "checkout" }
 | { kind: "update"; removeLines: number[] };

/** Every value a form field can arrive as, once readBody() has normalised it. */
type Field = unknown;

const asList = (v: Field): string[] => (Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]);

/** A quantity of exactly zero is a removal. Anything unparseable is not — an empty or junk value
 *  must never be read as "remove this line". */
function isZero(raw: string): boolean {
 const t = raw.trim();
 if (!t) return false;
 const n = Number(t);
 return Number.isFinite(n) && n === 0;
}

/**
 * Decide what this POST /cart is asking for.
 *
 * Deliberately conservative: only an explicit `checkout` field starts a checkout. A body with
 * neither button is Shopify's plain "recalculate", and reading that as a checkout would push a
 * shopper into payment when they only changed a quantity.
 */
export function cartSubmitAction(body: Record<string, Field>): CartSubmit {
 if (body && Object.prototype.hasOwnProperty.call(body, "checkout")) return { kind: "checkout" };

 const removeLines: number[] = [];

 // Positional form: updates[]=1&updates[]=0 — the nth value is the nth cart line, 1-based.
 asList(body?.["updates[]"]).forEach((v, i) => { if (isZero(v)) removeLines.push(i + 1); });

 // Indexed form: updates[2]=0. Themes use one or the other, never both.
 for (const key of Object.keys(body || {})) {
  const m = key.match(/^updates\[(\d+)\]$/);
  if (m && isZero(String(body[key]))) removeLines.push(Number(m[1]));
 }

 // The line/quantity pair, as the remove control sends it.
 if (body?.line != null && body?.quantity != null && isZero(String(body.quantity))) {
  const n = Number(String(body.line).trim());
  if (Number.isFinite(n) && n > 0) removeLines.push(n);
 }

 return { kind: "update", removeLines: [...new Set(removeLines)].sort((a, b) => a - b) };
}
