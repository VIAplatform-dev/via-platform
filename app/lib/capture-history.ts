// ONE STEP BACK, ON A TABLE THAT KEEPS NO HISTORY.
//
// site_captures holds ONE row per page (store_slug, path, html, …), overwritten in place. So every
// seller edit destroyed the version before it, irrecoverably — a mis-click on a captured homepage
// was permanent. This adds the cheapest possible safety net: the row also carries the html it had
// immediately before the last save, so the seller can put one page back the way it was.
//
// It is deliberately ONE step, not a history: the previous html doubles the row's size, and these
// rows hold whole pages (half a megabyte is normal). The UI says one step, and means it.
//
// These are the two decisions, kept pure so they can be tested without a database; the SQL in
// site-capture-db.ts does nothing but carry them out.

export type CaptureWritePlan = { write: false; reason: "unchanged" } | { write: true; previousHtml: string };

/**
 * Should this save be written, and what does it replace?
 *
 * The no-op guard matters more than it looks: after a seller edits the header, the edit route
 * propagates that change to every OTHER captured page. On a 780-page store, letting those writes
 * land unconditionally would overwrite 780 pages' undo points with copies of themselves — the
 * seller's one real undo, gone, in the same request that created it.
 */
export function planCaptureWrite(currentHtml: string, nextHtml: string): CaptureWritePlan {
 if (nextHtml === currentHtml) return { write: false, reason: "unchanged" };
 return { write: true, previousHtml: currentHtml };
}

export type CaptureUndoPlan = { restore: false; reason: "nothing-to-undo" } | { restore: true; html: string };

/** Put a page back to the version stored before its last save. An empty stored previous is treated
 *  as nothing to undo — restoring "" would blank the page, which is worse than refusing. */
export function planCaptureUndo(row: { html: string; previousHtml: string | null }): CaptureUndoPlan {
 if (!row.previousHtml) return { restore: false, reason: "nothing-to-undo" };
 return { restore: true, html: row.previousHtml };
}
