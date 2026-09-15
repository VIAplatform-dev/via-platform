/**
 * What an unpublished storefront shows. Pure.
 *
 * IT SHOWS ITSELF. A shop that has not been published yet serves its preview, with the not-live
 * ribbon, to whoever asks. Her address works from the moment she has one, which is most of what
 * makes it feel like hers, and she can send it to a friend for an opinion before she opens.
 *
 * IT USED TO 404. Next.js's black-on-white "404 This page could not be found", on her own domain,
 * to the person who built it, while the editor beside it showed that exact address as hers.
 *
 * AND THEN IT ALMOST GATED ON THE OWNER, which could never have worked: a storefront is served from
 * the seller's OWN domain, and her VYA session cookie is scoped to getvya.ai. There is no session
 * to read on vyasites.com, so "is this her?" is always no, and the owner would have been the one
 * person reliably shut out of her own shop. Worth writing down: it is not obvious until you have
 * made it.
 *
 * The ribbon is the honest part: anyone who reaches it can see it is not open yet.
 */

export type Visibility = "live" | "preview";

export function storefrontVisibility(enabled: boolean): Visibility {
 return enabled ? "live" : "preview";
}
