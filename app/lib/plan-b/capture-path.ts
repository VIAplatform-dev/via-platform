// Turning whatever a theme hands us into the path a capture is actually stored under.
//
// Themes identify "the page I am on" in several forms — relative, absolute, with a variant query,
// with a hash — and captures are stored under a bare path. Looking one up with the raw string misses
// whenever the shopper had a variant selected, which is the normal case on a product page: the URL
// reads /products/fendi-baguette?variant=57266943197515.
//
// That miss is what left the cart drawer empty after a successful add. The item went in, the page
// lookup returned nothing, and the drawer fell back to echoing its own captured (empty) markup. It
// affected every theme, including the ones that otherwise worked.

/**
 * The capture path for a URL or path a theme gave us.
 *
 * Query and hash are dropped; a trailing slash is NOT, because both forms get stored depending on how
 * the crawler reached the page and the callers already retry the other one. Case is preserved for the
 * same reason — a capitalised handle is stored capitalised.
 */
export function capturePathFor(urlOrPath: string | null | undefined): string {
 const raw = (urlOrPath || "").trim();
 if (!raw) return "/";

 // Absolute (or protocol-relative) → take the path. Anything unparseable falls through to the
 // string handling below rather than throwing.
 if (/^(https?:)?\/\//i.test(raw)) {
  try {
   const u = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
   return u.pathname || "/";
  } catch { /* fall through — treat it as a path */ }
 }

 const path = raw.split("#")[0].split("?")[0];
 if (!path) return "/";
 return path.startsWith("/") ? path : `/${path}`;
}
