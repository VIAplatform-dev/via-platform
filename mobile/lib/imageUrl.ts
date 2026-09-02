import { API_BASE_URL } from "./api";

// Store images and logos are stored as SITE-RELATIVE paths — "/stores/ange-archive.jpg" — because
// the web app serves them from its own /public. A native <Image> has no origin to resolve that
// against, so it silently renders nothing, which is why every store showed a blank card.
//
// Product images are already absolute (they come from the stores' own CDNs), so this passes them
// through untouched.

export function imageUrl(src: string | null | undefined): string | undefined {
  if (!src) return undefined;
  const s = String(src).trim();
  if (!s) return undefined;
  if (/^(https?:|data:|file:)/i.test(s)) return s;
  return `${API_BASE_URL}${s.startsWith("/") ? "" : "/"}${s}`;
}
