// WHAT THE SELLER IS TOLD ABOUT HER HOSTED STORE, AND WHETHER SHE CAN EDIT IT YET.
//
// Turns /api/store/capture's status into the one block the Hosted Store tab shows: what state her
// hosted copy is in, where it lives, which pages she can edit, and the link that opens each one in
// the click-to-edit view.
//
// The rule that matters: NEVER offer an edit button for a store with nothing captured. An import
// that failed, one still crawling with no pages yet, or a store that never imported all read the
// same to a seller — "there is nothing here" — and each gets a sentence saying so instead of a
// button that opens an empty page.
//
// Edit links are SAME-ORIGIN (/site/{slug}…), never the store's public address. Edit mode is gated
// on the seller's portal session (capture-edit-access.ts), and that session cookie belongs to the
// portal's host — an edit link pointing at her own domain would open her shop, signed out.
//
// It is also gated on her having LOOKED at the capture: until she has been through the side-by-side
// review on this same tab, the page list is shown without edit buttons and the block explains the
// step (capture-review-gate.ts). Both gates are enforced by the serve route as well; this module
// only decides what she is shown.

import { reviewGate, type ReviewState } from "./capture-review-gate.ts";

export type CaptureJobStatus = "running" | "paused" | "done" | "failed" | "stalled";

/** The subset of GET /api/store/capture this needs. */
export type CaptureStatus = {
 captured: number;
 url: string | null;
 slug: string | null;
 pages: string[];
 job?: { status: CaptureJobStatus | string; counts?: { pages?: number } | null } | null;
};

export type EditablePage = { path: string; label: string; editHref: string };

export type HostedStoreView = {
 /** none = nothing captured · importing = the crawl is still running ·
  *  review-first = captured, but she hasn't compared it with her own site yet · ready = hers to edit */
 state: "none" | "importing" | "review-first" | "ready";
 headline: string;
 detail: string;
 /** True only when there is at least one real captured page, we know the slug to open it with,
  *  AND she has been through the side-by-side review (see capture-review-gate.ts). */
 canEdit: boolean;
 /** Where the hosted copy is publicly reachable, if it is. */
 viewUrl: string | null;
 pages: EditablePage[];
 /** Captured product pages, which this editor deliberately does not offer. Shown as a sentence. */
 productPages: number;
 /** Side-by-sides she still has to look at before editing opens. Empty once she is through. */
 reviewRemaining: number;
};

// PRODUCT PAGES ARE NOT EDITABLE HERE, ON PURPOSE.
//
// A hosted product page is served by app/site/[slug]/products/[handle]/route.ts, which rebuilds it
// from the seller's LIVE inventory (title, price, photos, availability) — the captured HTML is only
// a template. So a click-to-edit save there would be overwritten by the next page load, and that
// route does not serve edit mode at all. Offering the button would be a promise the product page
// cannot keep; the seller edits those pieces in Listings.
//
// /cart is excluded for the same reason: the serve route replaces its body with the shopper's real
// VYA bag (buildFallbackCartPage), so there is nothing there for her to change.
const isProductPage = (p: string) => /^\/products\//.test(p);
const isDerivedPage = (p: string) => /^\/cart\/?$/.test(p);

const IN_FLIGHT = new Set(["running", "paused", "stalled"]);

const titleCase = (s: string) => s.replace(/[-_]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

/** A captured path, said the way a seller would say it. */
export function pageLabel(path: string): string {
 const p = (path || "/").replace(/\/+$/, "") || "/";
 if (p === "/") return "Home page";
 if (p === "/collections/all") return "All pieces";
 const seg = p.split("/").filter(Boolean).pop() || p;
 return titleCase(seg);
}

/** /site/{slug}/collections/all?edit=1 — a same-origin link into the click-to-edit view. */
function editHref(slug: string, path: string): string {
 const p = path === "/" || path === "" ? "/" : path;
 return `/site/${slug}${p}?edit=1`;
}

/**
 * @param review the side-by-side review state (app/lib/capture-review-gate.ts). Omit it only where
 *  the gate is not being applied — the serve route enforces it regardless, so this is display.
 */
export function describeHostedStore(status: CaptureStatus | null | undefined, review?: ReviewState | null): HostedStoreView {
 const slug = (status?.slug || "").trim();
 const all = (status?.pages ?? []).filter((p) => typeof p === "string" && p.startsWith("/"));
 const productPages = all.filter(isProductPage).length;
 const paths = all.filter((p) => !isProductPage(p) && !isDerivedPage(p));
 const jobStatus = status?.job?.status ?? null;
 const importing = !!jobStatus && IN_FLIGHT.has(String(jobStatus));
 const pagesSoFar = status?.job?.counts?.pages ?? status?.captured ?? 0;

 // Nothing captured. An in-flight crawl with no pages yet is still "nothing to edit" — it just
 // gets a different sentence, because one of those two will fix itself and the other will not.
 if (!paths.length || !slug) {
  if (importing) {
   return {
    state: "importing",
    headline: "We’re copying your site now",
    detail: `${pagesSoFar} pages copied so far. Your hosted store opens for editing as soon as the first pages land — this page updates when you reload it.`,
    canEdit: false, viewUrl: null, pages: [], productPages, reviewRemaining: 0,
   };
  }
  return {
   state: "none",
   headline: productPages > 0 ? "Nothing here to edit yet" : "You haven’t brought your site over yet",
   detail:
    productPages > 0
     ? `We hold ${productPages} of your product pages, but no home, collection or information pages — and product pages are built from your live inventory, so they’re edited in Listings. Re-run the import to bring the rest of your site over.`
     : jobStatus === "failed"
      ? "The last import didn’t finish, so there’s no hosted copy to edit. Run the import again from Import — nothing on your own site is affected."
      : "Import your existing store and we’ll host a copy of it here, page for page. Once it’s copied you can edit it right in this portal.",
   canEdit: false, viewUrl: null, pages: [], productPages, reviewRemaining: 0,
  };
 }

 const pages = paths.map((path) => ({ path, label: pageLabel(path), editHref: editHref(slug, path) }));
 const n = pages.length;

 // LOOK BEFORE YOU EDIT. Undefined `review` means the caller isn't applying the gate here; the
 // serve route applies it either way, so this only decides what she is shown.
 const gate = review === undefined ? { passed: true as const, reason: "reviewed" as const } : reviewGate(review);
 if (!gate.passed) {
  const left = gate.remaining.length;
  return {
   state: "review-first",
   headline: "One look through, then it’s yours to edit",
   // A step, not a fault: she is told what the step is for, how much of it is left, and where it is.
   detail: `Your site came over — ${n} page${n === 1 ? "" : "s"} of it. Before you start changing pages, go through the side-by-side below and tell us whether each one looks right. ${left} page${left === 1 ? "" : "s"} to go. It’s how we catch anything the copy didn’t get right, before you build on top of it.`,
   canEdit: false, viewUrl: status?.url ?? null, pages, productPages, reviewRemaining: left,
  };
 }
 // "We have never checked this store" is said out loud rather than passed off as a clean bill.
 const unchecked = gate.reason === "nothing-to-review"
  ? " We haven’t checked this copy against your own site yet, so have a look through it before you change much."
  : "";

 if (importing) {
  return {
   state: "importing",
   headline: "Your hosted store is filling up",
   detail: `${pagesSoFar} pages copied so far, and we’re still going. The ${n} page${n === 1 ? "" : "s"} below ${n === 1 ? "is" : "are"} already yours to edit.${unchecked}`,
   canEdit: true, viewUrl: status?.url ?? null, pages, productPages, reviewRemaining: 0,
  };
 }
 return {
  state: "ready",
  headline: "Your hosted store is live",
  detail: `${n} page${n === 1 ? "" : "s"} of your site ${n === 1 ? "is" : "are"} hosted here and open for editing.${unchecked}`,
  canEdit: true, viewUrl: status?.url ?? null, pages, productPages, reviewRemaining: 0,
 };
}
