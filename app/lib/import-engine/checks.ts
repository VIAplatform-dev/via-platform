// Structural fidelity checks for a captured page — the questions "did this import actually work?"
// reduces to: did the store's navigation survive, does its own product card get reused for live
// inventory, and do the homepage grids know which collection they belong to?
//
// ONE implementation, two callers:
//   • scripts/eval-import.ts  — scores the 16-store corpus (offline, no DB)
//   • the import pipeline     — runs the same checks at import time and reports failures as warnings
//
// They must share this code. A second copy would drift, and then the harness and the importer would
// disagree about whether a store is fine — the same reconciliation trap the brand/category rules
// avoid by having one canonical inferBrandFromTitle.

import * as cheerio from "cheerio";
// Relative imports (not the "@/app" alias): the harness runs this under Node's native TS execution,
// which doesn't read tsconfig paths.
import { injectCollectionItems, detectGridHandles, type CollectionCardItem } from "../site-capture.ts";

/** Three probe items are enough to prove a live grid renders in the store's own card.
 *  Shared so the harness and the import-time check measure the identical thing. */
export const PROBE_ITEMS: CollectionCardItem[] = [
 { id: "e1", title: "1990s Silk Slip Dress", priceCents: 18000, currency: "USD", images: ["https://x/1.jpg"], sourceId: "silk-slip" },
 { id: "e2", title: "Beaded Evening Clutch", priceCents: 9500, currency: "USD", images: ["https://x/2.jpg"], sourceId: "clutch" },
 { id: "e3", title: "Wool Overcoat", priceCents: 42000, currency: "USD", images: ["https://x/3.jpg"], sourceId: "coat" },
];

export type CaptureScore = {
 /** `theme` = the store's own product card was cloned; `fallback` = our generic grid; `none` = no grid. */
 grid: "theme" | "fallback" | "none";
 /** How many probe items actually rendered into the grid. */
 titles: number;
 sampleSize: number;
 /** One entry per detected grid: the collection handle it belongs to, or null if unresolved. */
 handles: (string | null)[];
 /** Links inside the page's navigation landmarks. Zero on a page that HAS chrome means the nav was
  *  eaten during capture — the `[class*="localization"]` bug deleted whole headers this way. */
 navLinks: number;
 /** Whether the page has header/nav/footer chrome at all (a bare product page legitimately may not). */
 hasChrome: boolean;
};

/** Score one page's captured HTML. Pure — no network, no database. */
export function scoreCaptureHtml(html: string): CaptureScore {
 let grid: CaptureScore["grid"] = "none";
 let titles = 0;
 const out = injectCollectionItems(html, PROBE_ITEMS, (it) => `/p/${it.id}`);
 const $out = cheerio.load(out);
 const $live = $out("[data-vya-collection]");
 if ($live.length) {
  // Our generic substitute grid is the one that sets its own grid-template-columns; a cloned theme
  // card inherits the store's layout instead, so it carries no inline grid style.
  const generic = ($live.attr("style") || "").includes("grid-template-columns");
  grid = generic ? "fallback" : "theme";
  titles = PROBE_ITEMS.filter((s) => out.includes(s.title)).length;
 }

 const $ = cheerio.load(html);
 const $chrome = $("header, nav, [role='navigation']");
 const navLinks = $chrome.find("a[href]").length;

 return {
  grid,
  titles,
  sampleSize: PROBE_ITEMS.length,
  handles: detectGridHandles(html),
  navLinks,
  hasChrome: $chrome.length > 0,
 };
}

/** Fidelity notes for the HARNESS scorecard. Kept exactly as the harness has always printed them so
 *  the published baseline stays comparable run to run. */
export function gridNotes(s: CaptureScore): string[] {
 const notes: string[] = [];
 if (s.grid === "fallback") notes.push("generic grid — theme card not found");
 if (s.grid === "theme" && s.titles < s.sampleSize) notes.push(`only ${s.titles}/${s.sampleSize} titles rendered`);
 if (s.handles.length && s.handles.every((h) => h === null)) notes.push("grids found but no collection handles resolved");
 return notes;
}

/**
 * Seller-facing warnings for an IMPORT. Same measurements, phrased for someone who does not know
 * what a "theme card" is, and with the navigation check the harness doesn't print.
 *
 * `path` is the captured page these came from, so a warning points somewhere.
 */
export function importWarnings(s: CaptureScore, path: string): string[] {
 const where = path === "/" ? "your homepage" : `“${path}”`;
 const notes: string[] = [];
 if (s.hasChrome && s.navLinks === 0) {
  notes.push(`The navigation menu on ${where} didn’t survive the copy — your site will load without its menu links.`);
 }
 if (s.grid === "fallback") {
  notes.push(`We couldn’t match your product layout on ${where}, so products there show in a standard grid instead of your own design.`);
 }
 if (s.grid === "theme" && s.titles < s.sampleSize) {
  notes.push(`Only ${s.titles} of ${s.sampleSize} test products rendered into the grid on ${where} — some listings may not appear.`);
 }
 if (s.handles.length && s.handles.every((h) => h === null)) {
  notes.push(`The product rows on ${where} aren’t linked to a collection, so they’ll show your newest items rather than that specific collection.`);
 }
 return notes;
}
