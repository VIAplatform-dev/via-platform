// Does the shop being imported already belong to a DIFFERENT store? Pure — no I/O.
//
// The owner is deliberately exempt from the "this store already has a site" guard, because
// re-importing is how a broken store gets repaired. That exemption has no idea WHICH store is
// selected, so one wrong pick in the switcher runs a full import of somebody else's shop into a
// seller's account: their pages copied, their products written into her inventory, their collections
// created, and whatever she had deleted first.
//
// This is the other half of the guard. `reuse-capture.ts` asks "does this store already have a
// site?"; this asks "does this SITE already belong to another store?" — and that question catches the
// mistake the first one is designed to let through.
//
// It only refuses an exact host match, so it costs nothing legitimate: a shop nobody has imported,
// and re-importing your own, both pass.

export type OriginClaim = { slug: string; origin: string };

/**
 * One comparable form for a URL, host or origin: lower-cased host, no scheme, no `www.`, no port,
 * no path. `https://WWW.Shop.com/collections/all` and `shop.com` are the same shop.
 *
 * Null when there is no host to read — junk never blocks an import, because validating the URL the
 * seller typed belongs to the route, not here.
 */
export function originKey(urlOrHost: string | null | undefined): string | null {
 const raw = String(urlOrHost ?? "").trim();
 if (!raw) return null;
 const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
 let host: string;
 try {
  host = new URL(withScheme).hostname.toLowerCase();
 } catch {
  return null;
 }
 if (!host || !host.includes(".")) return null;
 return host.replace(/^www\./, "");
}

/**
 * The slug of another store that already holds captures from this shop, or null to allow.
 *
 * Allowed: your own shop (the repair path), a shop nobody holds, anything unparseable, and `force`
 * — the same deliberate override scripts use to re-crawl.
 */
export function conflictingOwner(
 requestedUrl: string | null | undefined,
 actingSlug: string,
 claims: OriginClaim[],
 force = false,
): string | null {
 if (force) return null;
 const want = originKey(requestedUrl);
 if (!want) return null;
 for (const c of claims) {
  if (c.slug === actingSlug) continue;
  if (originKey(c.origin) === want) return c.slug;
 }
 return null;
}
