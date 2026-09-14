import { API_BASE_URL } from "./api";
import { resizeImage } from "./image-size";

export { IMG, widthForLayout } from "./image-size";

// Store images and logos are stored as SITE-RELATIVE paths — "/stores/ange-archive.jpg" — because
// the web app serves them from its own /public. A native <Image> has no origin to resolve that
// against, so it silently renders nothing, which is why every store showed a blank card.
//
// Product images are already absolute (they come from the stores' own CDNs), so those only get
// their size asked for. See image-size.ts for why that matters so much.

/**
 * A displayable URL for a stored image path, at the size it will be drawn.
 *
 * Omit `width` only when the size genuinely isn't known — the original is then returned, which is
 * correct but can be two megabytes. Prefer one of IMG.
 */
export function imageUrl(src: string | null | undefined, width?: number): string | undefined {
 if (!src) return undefined;
 const s = String(src).trim();
 if (!s) return undefined;
 if (/^(data:|file:)/i.test(s)) return s;
 if (/^https?:/i.test(s)) return width ? resizeImage(s, width) : s;
 return `${API_BASE_URL}${s.startsWith("/") ? "" : "/"}${s}`;
}
