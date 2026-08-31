// WHO MAY OPEN A CAPTURED SITE'S EDITOR.
//
// A hosted store is served to the public — that is the point of it. Edit mode (?edit=1) is served
// by the SAME route, from the same stored HTML, and until this existed it was served to ANYONE who
// added the parameter: any shopper could put the seller's own click-to-edit toolbar over her live
// storefront. The save endpoint has always been auth-gated, so nothing could be written — but a
// visitor could still see an "editing your site" surface on a store that is not theirs, which reads
// as a defaced or broken shop.
//
// So the serve route asks this first. Pure and side-effect free: the caller resolves who is acting
// (app/lib/storeAuth.ts) and this decides. Denial is deliberately not an error page — the route
// falls through and serves the ordinary public page, so a shared link with ?edit=1 on the end
// simply shows the shop.

export type EditDenial = "signed-out" | "other-store";
export type EditAccess = { allowed: true } | { allowed: false; reason: EditDenial };

/** The store portal's own admin acts as the synthetic `via-admin` store, and previews any store's
 *  portal with ?store= — so an admin request is allowed regardless of which slug it resolved to. */
export type EditActor = { slug: string | null; isAdmin?: boolean };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function canEditCapture(siteSlug: string, actor: EditActor): EditAccess {
 if (actor.isAdmin) return { allowed: true };
 const acting = norm(actor.slug);
 // An empty acting slug is NOT a match for an empty site slug — that would open the editor to
 // every signed-out visitor on a malformed route.
 if (!acting) return { allowed: false, reason: "signed-out" };
 if (acting === norm(siteSlug)) return { allowed: true };
 return { allowed: false, reason: "other-store" };
}
