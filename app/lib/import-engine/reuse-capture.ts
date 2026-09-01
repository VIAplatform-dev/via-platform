// WHETHER A SECOND IMPORT MAY RE-CRAWL, OR MUST HAND BACK THE SITE ALREADY HERE.
//
// A fresh import wipes the store's captured pages and crawls again from scratch. That is correct
// the first time and destructive every time after: it discards a hosted site along with every edit
// the seller made on top of it, and replaces it with whatever the new crawl happens to get. One
// button press, no confirmation, no way back.
//
// So a seller's import is idempotent. Press it once and her site is copied; press it again and she
// is handed the site she already has, reported exactly like a finished import. She is never shown a
// separate "you already did this" state, because from where she stands there isn't one — her site
// is on VYA either way, which is the only thing she asked for.
//
// The owner is exempt: re-importing IS the repair path, and the admin import page warns that it
// replaces the captured site. `force` is the same escape hatch for a script.
//
// Pure and unit tested so the destructive branch is decided in one place rather than inside a
// route handler where it can only be exercised with a real seller session.

export type ReuseInput = {
 /** How many pages this store already has captured. */
 captured: number;
 /** Owner/admin — allowed to re-crawl deliberately. */
 isOwner: boolean;
 /** Explicit opt-in to re-crawl anyway (scripts). */
 force?: boolean;
};

/** True when the request must NOT re-crawl, and should be answered with the existing capture. */
export function shouldReuseExistingCapture({ captured, isOwner, force }: ReuseInput): boolean {
 if (!(captured > 0)) return false; // nothing to protect — this is a first import
 if (force === true) return false;
 return !isOwner;
}
