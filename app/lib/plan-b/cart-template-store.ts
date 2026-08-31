// Where a store's derived cart template lives.
//
// Stored as a capture row under a reserved path rather than in a new table. That is deliberate: the
// template describes THIS capture's markup, so it must be created, replaced and deleted with it —
// `deleteCaptures(slug)` wiping the template is the correct behaviour, not a side effect to work
// around. A separate table would drift out of step with the capture the moment a store re-imports.
//
// The path is refused by the serve route (see app/site/[slug]/[[...path]]/route.ts) so it can never
// be fetched as a page.
import { getCapturePage, saveCapturePage } from "../site-capture-db.ts";
import type { CartTemplate } from "./derive-cart-template.ts";

/** Reserved: not a page, and never served. */
export const CART_TEMPLATE_PATH = "/__vya/cart-template";

/** True for any reserved internal path, so the serve route can refuse it. */
export function isReservedCapturePath(pathname: string): boolean {
 return (pathname || "").toLowerCase().startsWith("/__vya/");
}

export async function saveCartTemplate(slug: string, template: CartTemplate): Promise<void> {
 await saveCapturePage(slug, CART_TEMPLATE_PATH, JSON.stringify(template), "");
}

/**
 * The store's derived template, or null when there isn't a usable one.
 *
 * Validates rather than trusting: a template from an older derivation (different `version`) or a
 * truncated row would render a broken cart, and the caller's fallback is a working page.
 */
export async function loadCartTemplate(slug: string): Promise<CartTemplate | null> {
 const raw = await getCapturePage(slug, CART_TEMPLATE_PATH).catch(() => null);
 if (!raw) return null;
 try {
  const t = JSON.parse(raw) as CartTemplate;
  if (t?.version !== 1 || !t.rowHtml || typeof t.rowHtml !== "string") return null;
  return t;
 } catch {
  return null;
 }
}
