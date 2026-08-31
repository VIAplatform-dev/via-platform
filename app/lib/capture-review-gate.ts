// LOOK BEFORE YOU EDIT.
//
// A captured store is a copy of the seller's real shop, made by a crawler. Before she starts
// changing pages she has to have looked at them next to her own site — otherwise her first act on
// the hosted copy is to edit a page she has never compared, and a capture fault (a lost banner, a
// collection that came over wrong) gets baked into an edit instead of reported as a fault.
//
// That comparison already exists: the Hosted Store tab shows a side-by-side per page and asks
// "does it look right?" (app/api/store/hosted-review, app/lib/store-health-db.ts). This is the rule
// that turns those answers into permission to edit. Pure, so both the portal and the serve route
// can apply the same rule and agree.
//
// THE RULE, and why:
//
//  • EVERY side-by-side in the check must carry an answer. One answer out of six proves she looked
//    at one page, not that she looked through her store. "Reviewed" has to mean reviewed.
//
//  • `skip` counts. Skipping is a deliberate act on a page she has just been shown; refusing it
//    would push sellers to click "Looks right" on pages they have no view about, purely to unlock
//    the editor — which corrupts the one honest signal this review exists to collect.
//
//  • `something's off` counts, emphatically. A seller who has just told us her hosted copy is
//    wrong has the strongest possible reason to be let into the editor, not the weakest.
//
//  • NO CHECK AT ALL IS NOT "NOT REVIEWED". The health check is produced by our own tooling, on our
//    schedule. A store that has never been graded has nothing for her to look at, and blocking her
//    would be a locked door with no key on our side of it. That is "nothing to review", and it
//    passes — with the portal saying so, rather than implying she has been checked.

export type ReviewAnswerRow = { page: string };

export type ReviewState = {
 /** Pages with a side-by-side in the latest health check. `null` = no check has ever run. */
 screens: string[] | null;
 /** Pages she has answered — ANY answer, `skip` included. */
 answered: string[];
};

export type ReviewGate =
 | { passed: true; reason: "nothing-to-review" | "reviewed" }
 | { passed: false; remaining: string[]; reviewed: number; total: number };

/** Trailing slashes are the same page; the check and her answers can disagree on one. */
const key = (p: string) => (p || "").trim().replace(/\/+$/, "") || "/";

export function reviewGate(state: ReviewState | null | undefined): ReviewGate {
 const screens = state?.screens;
 if (!screens || screens.length === 0) return { passed: true, reason: "nothing-to-review" };

 const answered = new Set((state?.answered ?? []).map(key));
 const remaining = screens.filter((s) => !answered.has(key(s)));
 if (remaining.length === 0) return { passed: true, reason: "reviewed" };
 return { passed: false, remaining, reviewed: screens.length - remaining.length, total: screens.length };
}

/**
 * What the OWNER sees when she opens an edit link before reviewing.
 *
 * Falling through to the plain public page is right for a shopper — a link with ?edit=1 on the end
 * should just show the shop. For the seller it is a silent failure: she clicked Edit (or opened the
 * storefront studio, which loads this URL in an iframe) and got a page that will not edit, with
 * nothing saying why. So her copy of that page carries one line explaining the step and where to
 * do it. Shoppers never see this: the caller only injects it for a request that passed
 * canEditCapture.
 *
 * Returns an HTML fragment; the caller appends it to the served page.
 */
export function reviewGateNoticeHtml(gate: Extract<ReviewGate, { passed: false }>, portalUrl = "/store/dashboard"): string {
 const left = gate.remaining.length;
 return `<div style="position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:min(560px,92vw);background:#fff;color:#5D0F17;border:1px solid rgba(93,15,23,.16);border-radius:14px;padding:13px 17px;font:14px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;box-shadow:0 14px 38px -12px rgba(43,36,29,.42)">
<strong style="font-weight:600">One look through first.</strong> Editing opens once you've been through the side-by-side check of your hosted copy — ${left} page${left === 1 ? "" : "s"} to go. <a href="${portalUrl}" style="color:#5D0F17;text-decoration:underline">Open it in your portal</a>.
</div>`;
}
