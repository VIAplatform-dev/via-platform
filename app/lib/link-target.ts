// Where does a link on the seller's own site actually go?
//
// The storefront editor shows a link as a URL in a text box, which is the one thing a seller can't
// read. She clicks CLOTHING in her nav, sees "#", and to reach that page she scrolls a strip of
// eighty thumbnails looking for the word. This answers the question the box doesn't: the link points
// at THIS page of yours — here's a button.
//
// Kept out of the editor component so it can be tested without a browser, and reused by any panel
// that renders a link (nav items, collection tiles, buttons, footers).

import { pageLabel } from "./hosted-store-entry.ts";

export type LinkTarget =
 /** Goes to one of her captured pages. `matched` says how sure we are. */
 | { kind: "page"; path: string; label: string; matched: "url" | "name" }
 /** Points inside her site at a page that didn't come over in the import. */
 | { kind: "missing"; path: string }
 /** Leaves her site. */
 | { kind: "external"; href: string; host: string }
 /** "#", empty, javascript: — a link that goes nowhere. */
 | { kind: "none" };

const norm = (p: string) => {
 const s = (p || "").split("?")[0].split("#")[0].trim();
 if (!s) return "";
 const t = s.replace(/\/+$/, "");
 return t || "/";
};

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Strip the editor's own /site/{slug} mount so a captured href compares against a stored path. */
function unmount(path: string, slug?: string | null): string {
 if (!slug) return path;
 const pfx = `/site/${slug}`;
 if (path === pfx) return "/";
 return path.startsWith(pfx + "/") ? path.slice(pfx.length) : path;
}

function findPage(path: string, pages: string[]): string | null {
 const want = key(norm(path));
 for (const p of pages) if (key(norm(p)) === want) return p;
 return null;
}

/**
 * The nav item that says "Clothing" and links to "#" is a dropdown parent: the real page exists, the
 * anchor just never carried its address. Matching on the visible words is a guess, so it is only ever
 * a fallback for a link with no usable URL, and only on an exact name — never a prefix.
 */
function findByName(label: string, pages: string[]): string | null {
 const want = key(label);
 if (want.length < 2) return null;
 for (const p of pages) {
  if (key(pageLabel(p)) === want) return p;
  const seg = norm(p).split("/").filter(Boolean).pop() || "";
  if (seg && key(seg.replace(/[-_]+/g, " ")) === want) return p;
 }
 return null;
}

export function resolveLinkTarget(
 href: string,
 label: string,
 pages: string[],
 opts?: { slug?: string | null; origin?: string | null },
): LinkTarget {
 const raw = (href || "").trim();
 const asPage = (path: string, matched: "url" | "name"): LinkTarget => ({ kind: "page", path, label: pageLabel(path), matched });
 const byName = (): LinkTarget => {
  const hit = findByName(label || "", pages);
  return hit ? asPage(hit, "name") : { kind: "none" };
 };

 if (!raw || raw === "#" || /^javascript:/i.test(raw)) return byName();
 if (/^(mailto|tel|sms):/i.test(raw)) return { kind: "external", href: raw, host: raw.slice(raw.indexOf(":") + 1) };
 // A bare "#section" scrolls this page; it is not a destination, but the words may still name one.
 if (raw.startsWith("#")) return byName();

 let path: string;
 if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) {
  let u: URL;
  try { u = new URL(raw.startsWith("//") ? `https:${raw}` : raw); } catch { return { kind: "none" }; }
  const own = (() => { try { return opts?.origin ? new URL(opts.origin).host : ""; } catch { return ""; } })();
  // Her own domain written out in full is still a link to her own page.
  if (!own || key(u.host) !== key(own)) return { kind: "external", href: raw, host: u.host };
  path = u.pathname;
 } else if (raw.startsWith("/")) {
  path = raw;
 } else {
  // "collections/children" — relative, and we have no base to resolve it against reliably.
  path = `/${raw}`;
 }

 path = unmount(norm(path), opts?.slug);
 const hit = findPage(path, pages);
 if (hit) return asPage(hit, "url");
 // It addresses her site but we don't hold that page. Say so rather than guessing from the words.
 return { kind: "missing", path };
}
