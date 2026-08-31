// IS THIS SAVE WORTH WRITING AT ALL?
//
// site_captures holds ONE row per page, overwritten in place. Versions of what a write replaces now
// live in capture-versions-db.ts, three deep — but a write that changes NOTHING must still not
// happen, and that is what this decides. Kept pure so it can be tested without a database.

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
