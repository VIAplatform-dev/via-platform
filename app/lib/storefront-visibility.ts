/**
 * Who may see a storefront that is not published yet. Pure.
 *
 * HER OWN ADDRESS SHOULD NEVER 404 AT HER. An unpublished shop answered its own address with
 * Next.js's black-on-white "404 This page could not be found" — to the person who built it, while
 * the editor beside it was showing her that exact address as hers. Nothing about that says "you
 * haven't published yet"; it says the thing is broken.
 *
 * So the shop decides what to show by WHO IS ASKING:
 *   · published            → the shop, to anyone.
 *   · not published, hers  → the shop, with the not-live ribbon. Her address works from the moment
 *                            she has one, which is what makes it feel like hers.
 *   · not published, else  → a plain "not open yet" page. Not the contents: an unpublished shop is
 *                            not public, and a 404 is not the honest way to say so either.
 *
 * `?preview=` stays an explicit override for the editor, which loads this before a session exists.
 */

export type Viewer = {
 /** The editor asked for a preview outright (?preview=, or the /preview path). */
 previewing: boolean;
 /** This viewer can work on this shop — signed in with access, or VYA staff. */
 hasAccess: boolean;
};

export type Visibility = "live" | "preview" | "closed";

export function storefrontVisibility(enabled: boolean, viewer: Viewer): Visibility {
 if (enabled) return "live";
 if (viewer.previewing || viewer.hasAccess) return "preview";
 return "closed";
}
